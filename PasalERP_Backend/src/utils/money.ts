export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const nearlyEqual = (a: number, b: number) => Math.abs(a - b) < 0.01;
