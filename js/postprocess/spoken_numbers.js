// Numeros por extenso (PT/ES/EN) -> valor. Porte enxuto de core/spoken_numbers.py,
// cobrindo 0-20, dezenas e cem (suficiente para "zero/cem para tudo" e valores falados comuns).
const MAP = {
  zero: 0, cero: 0,
  um: 1, uma: 1, uno: 1, una: 1, one: 1,
  dois: 2, duas: 2, dos: 2, two: 2,
  tres: 3, three: 3,
  quatro: 4, cuatro: 4, four: 4,
  cinco: 5, five: 5,
  seis: 6, six: 6,
  sete: 7, siete: 7, seven: 7,
  oito: 8, ocho: 8, eight: 8,
  nove: 9, nueve: 9, nine: 9,
  dez: 10, diez: 10, ten: 10,
  onze: 11, once: 11, eleven: 11,
  doze: 12, doce: 12, twelve: 12,
  treze: 13, trece: 13, thirteen: 13,
  quatorze: 14, catorze: 14, catorce: 14, fourteen: 14,
  quinze: 15, quince: 15, fifteen: 15,
  dezesseis: 16, dieciseis: 16, sixteen: 16,
  dezessete: 17, diecisiete: 17, seventeen: 17,
  dezoito: 18, dieciocho: 18, eighteen: 18,
  dezenove: 19, diecinueve: 19, nineteen: 19,
  vinte: 20, veinte: 20, twenty: 20,
  trinta: 30, treinta: 30, thirty: 30,
  quarenta: 40, cuarenta: 40, forty: 40,
  cinquenta: 50, cincuenta: 50, fifty: 50,
  sessenta: 60, sesenta: 60, sixty: 60,
  setenta: 70, seventy: 70,
  oitenta: 80, ochenta: 80, eighty: 80,
  noventa: 90, ninety: 90,
  cem: 100, cien: 100, ciento: 100, hundred: 100
};

export function spokenToNumber(norm) {
  if (norm == null) return null;
  return Object.prototype.hasOwnProperty.call(MAP, norm) ? MAP[norm] : null;
}
