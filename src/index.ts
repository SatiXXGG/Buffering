export enum NumberType {
	i8 = "i8",
	u8 = "u8",
	i16 = "i16",
	u16 = "u16",
	i32 = "i32",
	u32 = "u32",
	f32 = "f32",
	f64 = "f64",
}

type PrimitiveType = NumberType | "string" | "bool" | "specialString" | "nonBufferString";

const BYTE_SIZING = {
	[NumberType.u8]: 1,
	[NumberType.i8]: 1,
	[NumberType.u16]: 2,
	[NumberType.i16]: 2,
	[NumberType.u32]: 4,
	[NumberType.i32]: 4,
	[NumberType.f32]: 4,
	[NumberType.f64]: 8,
};

const DIGIT_PRECISION: Record<NumberType, number> = {
	[NumberType.u8]: 3,
	[NumberType.i8]: 3,
	[NumberType.u16]: 5,
	[NumberType.i16]: 5,
	[NumberType.u32]: 10,
	[NumberType.i32]: 10,
	[NumberType.f32]: 7,
	[NumberType.f64]: 17,
};

interface element<T extends PrimitiveType = PrimitiveType> {
	size: number;
	type: T;
	offset: number;
}

interface Scheme {
	[key: string]: element;
}

type ElementToType<S extends Scheme, K extends keyof S> = S[K]["type"] extends "string"
	? string
	: S[K]["type"] extends "bool"
		? boolean
		: S[K]["type"] extends NumberType
			? number
			: S[K]["type"] extends "specialString"
				? string
				: never;

type ReadOutput<S extends Scheme> = {
	[K in keyof S]: ElementToType<S, K>;
};

export type BufferingOptional<S extends Scheme> = { [key in keyof S]?: ElementToType<S, key> };
export type BufferingInstance<S extends Scheme> = [buffer, BufferingOptional<S>];

export class Buffering<S extends Scheme> {
	private size = 0;
	private defaultSize = 0;
	private scheme: Scheme;
	constructor(scheme: Scheme) {
		this.scheme = scheme;

		for (const [key, value] of pairs(scheme)) {
			value.offset = this.size;
			this.size += value.size;
			if (DIGIT_PRECISION[value.type as NumberType] !== undefined) {
				this.defaultSize += (DIGIT_PRECISION[value.type as NumberType] * 3.32) / 8;
			} else if (value.type === "string") {
				this.defaultSize += value.size;
			} else if (value.type === "bool") {
				this.defaultSize += 1;
			}
		}
	}
	/**
	 * Generates a number for the scheme
	 * Precision can be lost on very HIGH numbers be aware
	 * @param Type
	 * @returns
	 */
	static number(Type: NumberType): element<NumberType> {
		return {
			type: Type,
			size: BYTE_SIZING[Type],
			offset: 0,
		};
	}
	/**
	 * Generates a string
	 * @param size
	 * @returns
	 */
	static string(size: number): element<"string"> {
		return {
			size: size,
			type: "string",
			offset: 0,
		};
	}

	static nonBufferString(): element<"nonBufferString"> {
		return {
			size: 0,
			type: "nonBufferString",
			offset: 0,
		};
	}

	static specialString(): element<"specialString"> {
		return {
			size: 0,
			type: "specialString",
			offset: 0,
		};
	}
	/**
	 * Generates a bool
	 * @returns
	 */

	static bool(): element<"bool"> {
		return {
			size: 1,
			type: "bool",
			offset: 0,
		};
	}

	read(instance: BufferingInstance<S>): ReadOutput<S> {
		const [buff, data] = instance;
		const result = { ...data } as ReadOutput<S>;

		for (const [key, field] of pairs(this.scheme)) {
			const offset = field.offset;

			let value: unknown;
			switch (field.type) {
				case NumberType.u8:
					value = buffer.readu8(buff, offset);
					break;
				case NumberType.i8:
					value = buffer.readi8(buff, offset);
					break;
				case NumberType.u16:
					value = buffer.readu16(buff, offset);
					break;
				case NumberType.i16:
					value = buffer.readi16(buff, offset);
					break;
				case NumberType.u32:
					value = buffer.readu32(buff, offset);
					break;
				case NumberType.i32:
					value = buffer.readi32(buff, offset);
					break;
				case NumberType.f32:
					value = buffer.readf32(buff, offset);
					break;
				case NumberType.f64:
					value = buffer.readf64(buff, offset);
					break;
				case "string":
					value = buffer.readstring(buff, offset, field.size);
					break;
				case "bool":
					value = buffer.readu8(buff, offset) === 1;
					break;
				case "specialString":
					value = buffer.readstring(buff, offset, buffer.readu8(buff, offset - 1));
					break;
			}

			result[key as keyof S] = value as ElementToType<S, keyof S>;
		}

		return result;
	}

	hasSpecial(): boolean {
		for (const [key, value] of pairs(this.scheme)) {
			if (value.type === "specialString") {
				return true;
			}
		}
		return false;
	}
	write(info: {
		[key in keyof S]: ElementToType<S, key>;
	}): BufferingInstance<S> {
		//* updates the sizing and the offset
		if (this.hasSpecial()) {
			for (const [key, value] of pairs(this.scheme)) {
				value.offset = this.size;
				if (value.type === "specialString" && info[key as keyof S] !== undefined) {
					value.offset = value.offset + 1;
					value.size = value.size + 1 + (info[key as keyof S] as string).size();
				}
				this.size += value.size;

				if (DIGIT_PRECISION[value.type as NumberType] !== undefined) {
					this.defaultSize += (DIGIT_PRECISION[value.type as NumberType] * 3.32) / 8;
				} else if (value.type === "string") {
					this.defaultSize += value.size;
				} else if (value.type === "bool") {
					this.defaultSize += 1;
				}
			}

			this.size = 0;
			for (const [key, value] of pairs(info)) {
				const field = this.scheme[key as keyof Scheme];
				if (field.type === "specialString") {
					const converted = value as string;
					field.size = 1 + converted.size();
					this.size = this.size + 1 + converted.size();
				} else {
					this.size = this.size + field.size;
				}
			}
		}

		const buff = buffer.create(this.size);
		const nonCompression: BufferingOptional<S> = {};
		for (const [key, field] of pairs(this.scheme)) {
			const value = info[key];
			const offset = field.offset;
			const convertedString = value as string;

			switch (field.type) {
				case NumberType.u8:
					buffer.writeu8(buff, offset, value as number);
					break;
				case NumberType.i8:
					buffer.writei8(buff, offset, value as number);
					break;
				case NumberType.u16:
					buffer.writeu16(buff, offset, value as number);
					break;
				case NumberType.i16:
					buffer.writei16(buff, offset, value as number);
					break;
				case NumberType.u32:
					buffer.writeu32(buff, offset, value as number);
					break;
				case NumberType.i32:
					buffer.writei32(buff, offset, value as number);
					break;
				case NumberType.f64:
					buffer.writef64(buff, offset, value as number);
					break;
				case NumberType.f32:
					buffer.writef32(buff, offset, value as number);
					break;
				case "string":
					buffer.writestring(buff, offset, value as string, field.size);
					break;
				case "bool":
					buffer.writeu8(buff, offset, (value as boolean) ? 1 : 0);
					break;
				case "specialString":
					buffer.writeu8(buff, offset - 1, convertedString.size());
					buffer.writestring(buff, offset, convertedString, field.size - 1);
					break;
				case "nonBufferString":
					nonCompression[key as keyof S] = value;
			}
		}

		return [buff, nonCompression];
	}
}
