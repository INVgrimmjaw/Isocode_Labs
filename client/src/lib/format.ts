import { locale } from './i18n.ts';

const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
const timeOptions: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

const tag = () => (locale.get() === 'hi' ? 'hi-IN' : 'en-IN');

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(tag(), options);
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(tag(), timeOptions);
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)}, ${formatTime(iso)}`;
}

/** A SKU name without the "case of 96" the seed data carries, which a shopkeeper reads elsewhere. */
export function shortName(name: string): string {
  return name.split(',')[0] ?? name;
}

export function maskedPhone(phone: string): string {
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
}
