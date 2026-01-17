// The not-for-just-one-thing typings
export type createIncrementingArrayOfLength<
  length extends number,
  temp extends number[] = [],
> = temp["length"] extends length
  ? temp
  : createIncrementingArrayOfLength<length, [...temp, temp["length"]]>;
export type addOneIncrement<value extends number[]> = [
  ...value,
  value["length"],
];
export type rangeArray<from extends number, to extends number> =
  addOneIncrement<createIncrementingArrayOfLength<to>> extends [
    ...createIncrementingArrayOfLength<from>,
    ...infer value,
  ]
    ? value
    : never;
export type uint8ArrayLike = Pick<number[], number | "length">;
export type asyncify<value extends any> = {
  [key in keyof value]: value[key] extends (...args: any) => Promise<any>
    ? value[key]
    : value[key] extends (...args: any) => any
      ? (...args: Parameters<value[key]>) => Promise<ReturnType<value[key]>>
      : value[key];
};
export type IsAUnionAtTopLevel<T, U = T> = U extends any
  ? [T] extends [U[any]]
    ? true
    : false
  : false;
// Logic thanks to https://stackoverflow.com/a/79012805
export type topLevelUnionArray<Array extends any[]> = Array extends [
  infer First,
  ...infer Rest,
]
  ? First extends any
    ? Rest extends [any, ...any[]]
      ? [First, ...topLevelUnionArray<Rest>]
      : [First]
    : never
  : never;
export type json = {
  [key in string | number]: (string | number | json)[] | string | number | json;
};
export type cloneFunc<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => R
  : never;
export type AwaitedUnion<T> = T extends Promise<infer U> ? AwaitedUnion<U> : T;
export type MaybePromise<
  T,
  IsAsync extends Boolean = true | false,
> = IsAsync extends false ? T : Promise<T>;
export type CouldBePossiblyPromise<
  T,
  CouldBePromise extends boolean = true | false,
> = CouldBePromise extends false ? T : Promise<T> | T;
export type commonKeys<T, U> = keyof T & keyof U;
export type mergeValues<T, U> = {
  [key in commonKeys<T, U>]: T[key] | U[key];
};
