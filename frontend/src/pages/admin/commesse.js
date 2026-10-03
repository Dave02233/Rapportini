export const STATO_COMMESSA = {
  in_corso: "In corso",
  completata: "Completata",
  annullata: "Annullata",
};

export const STATO_TICKET = {
  in_corso: "In corso",
  completato: "Completato",
  annullato: "Annullato",
};

// Su una riga di /commesse/riepilogo
export function speseCommessa(c) {
  return (c.costo_ticket || 0) + (c.costo_materiali || 0);
}
