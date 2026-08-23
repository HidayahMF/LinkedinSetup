export function validate<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
  return schema.parse(data)
}
