export const Result = {
  success(data = null) {
    return { success: true, data, errorCode: null, errorMessage: null }
  },
  fail(code, message = '') {
    return { success: false, data: null, errorCode: code, errorMessage: message }
  },
  error(code = -1, message = '系统错误') {
    return { success: false, data: null, errorCode: code, errorMessage: message }
  }
}
