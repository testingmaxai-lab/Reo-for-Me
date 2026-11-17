/** Days and months in te reo Māori (the forms promoted by Te Taura Whiri i te Reo Māori). */
export const RA = ['Rātapu', 'Rāhina', 'Rātū', 'Rāapa', 'Rāpare', 'Rāmere', 'Rāhoroi']; // Sunday first
export const MARAMA = ['Kohitātea', 'Huitanguru', 'Poutūterangi', 'Paengawhāwhā', 'Haratua', 'Pipiri', 'Hōngongoi', 'Hereturikōkā', 'Mahuru', 'Whiringa-ā-nuku', 'Whiringa-ā-rangi', 'Hakihea'];
export function maoriDate(t: number): string {
  const d = new Date(t);
  return `${RA[d.getDay()]}, ${d.getDate()} ${MARAMA[d.getMonth()]}`;
}
export const greeting = (t: number) => (new Date(t).getHours() < 12 ? 'Ata mārie' : 'Kia ora');
/** Short day label: the part after Rā- (Hina, Tū, Apa, Pare, Mere, Horoi, Tapu). */
export const shortDay = (t: number) => { const n = RA[new Date(t).getDay()].slice(2); return n[0].toUpperCase() + n.slice(1); };
