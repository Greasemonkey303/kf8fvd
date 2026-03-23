declare module 'zxcvbn' {
  type ZXCVBNResult = {
    score: number
    [key: string]: unknown
  }
  const zxcvbn: (password: string) => ZXCVBNResult
  export default zxcvbn
}
