function safeId(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (/^[a-zA-Z0-9]{15}$/.test(text)) return text;
  const number = Number(text);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

module.exports = { safeId };
