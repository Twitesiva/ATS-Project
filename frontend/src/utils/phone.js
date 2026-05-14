export const normalizePhone10 = (value) => String(value || "").replace(/\D/g, "").slice(0, 10);

export const isValidPhone10 = (value) => normalizePhone10(value).length === 10;

