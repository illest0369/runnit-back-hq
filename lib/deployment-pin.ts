export const AUTH_PIN_COOKIE = 'auth_pin'
const AUTH_PIN_MAX_AGE = 60 * 60 * 24 * 7

export function isValidPinFormat(pin: string) {
  return /^\d{6}$/.test(pin)
}

export function getValidAppPins() {
  return (process.env.APP_PIN ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(isValidPinFormat)
}

export function hasConfiguredAppPins() {
  return getValidAppPins().length > 0
}

export function isValidAppPin(pin: string) {
  const normalized = pin.trim()
  if (!isValidPinFormat(normalized)) {
    return false
  }

  return getValidAppPins().includes(normalized)
}

export function hasValidAppPinValue(pin: string | null | undefined) {
  return isValidAppPin(pin ?? '')
}

export function getAuthPinCookieMaxAge() {
  return AUTH_PIN_MAX_AGE
}
