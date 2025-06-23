
# Buffering is a roblox-ts package to make buffers a lot easier to manage without making repetitive code! 😈
## A light-weight, Straight to point and basic buffer library alternative to other packages

## Create a scheme

```ts
const scheme = {
	amount: Buffering.number(NumberType.u8),
	name: Buffering.string(10),
	has: Buffering.bool(),
};
```
## Create a buffer ⚒
```ts
const buff = new Buffering<typeof scheme>(scheme);
```

## Serialize your data 💭
```ts
const data = {
	amount: 21,
	name: "hello world",
	has: true,
};
const serialized = buff.write(data);
```

## Read your data ⼳
 ```ts
buff.read(serialized)
```

Enjoy the type safety when reading and writing 🧼
