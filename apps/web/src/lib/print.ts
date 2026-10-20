// Chrome imprime en los márgenes de la página el título de la pestaña, la fecha y la URL. Con
// margen 0 no tiene dónde ponerlos, así que el espacio en blanco lo da el padding del overlay.
// El título también es el nombre que Chrome propone al guardar como PDF.
export function printDocument({ title, ticketPadding }: { title: string; ticketPadding?: string }) {
  const previousTitle = document.title;
  document.title = title;

  let pageStyle: HTMLStyleElement | null = null;
  if (ticketPadding) {
    pageStyle = document.createElement('style');
    pageStyle.textContent = `@media print { @page { size: 80mm auto; margin: 0; } body.print-sale .sale-print-overlay { padding: ${ticketPadding}; } }`;
    document.head.appendChild(pageStyle);
    document.body.classList.add('print-sale');
  }

  try {
    window.print();
  } finally {
    document.body.classList.remove('print-sale');
    pageStyle?.remove();
    document.title = previousTitle;
  }
}
