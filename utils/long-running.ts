export function expensiveHash(data: any) {
  // simulate heavy CPU work — e.g. a big crypto hash or image transform
  let result = 0;
  for (let i = 0; i < 500_000_000_000_000; i++) {
    result += Math.sqrt(i);
  }
  return result;
}
