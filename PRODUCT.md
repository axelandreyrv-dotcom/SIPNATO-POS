# Product

## Register

product

## Users

Por negocio: el **dueño**, sus **administradores** y **cajeros** de talleres (celulares, electrónica, mecánica), tiendas y otros comercios pequeños de Costa Rica. Operan desde desktop durante el día de trabajo; el dueño consulta reportes y órdenes desde su celular (390px viewport). Están en modo tarea: cobran, registran, abren caja, buscan una orden. No tienen tiempo de aprender; el sistema debe ser autoevidente.

Además, el **superadministrador de la plataforma** (Dosuxsoft) usa el panel `admin.` para dar de alta negocios y registrar el pago de su mensualidad, a menudo desde el celular.

## Product Purpose

Sistema POS multi-negocio para comercios pequeños en Costa Rica. Gestiona ventas (monto libre o carrito con inventario, cobro en colones o dólares), caja, gastos, clientes, órdenes de servicio configurables por tipo de negocio, cotizaciones, facturas, apartados, créditos, avisos por WhatsApp y notas internas. La meta de éxito es que cualquier operación frecuente (cobrar una venta, abrir/cerrar caja, buscar una orden) se complete en menos de 5 segundos, sin pensar.

## Brand Personality

Modular · Intuitivo · Eficiente

El sistema se siente como una herramienta profesional que respeta el tiempo del usuario. Organizado en bloques claros, navegación visual con íconos legibles, sin pasos innecesarios. Referencia de arquitectura: interfaz modular de Odoo (cuadrícula de módulos con íconos limpios). El diseño desaparece en la tarea.

## Anti-references

- Consumer apps con animaciones elaboradas y micro-interacciones decorativas (no es una app de lifestyle).
- Enterprise bloat: paneles densos de texto, menús de 3 niveles, tablas con 20 columnas visibles.
- SaaS genérico "moderno": gradientes de azul a morado, glassmorphism decorativo, hero-metrics con números enormes.
- Paletas oscuras tipo terminal/hacker (neón sobre negro) — el dark mode es ejecutivo, no dramático.

## Design Principles

1. **El módulo es la unidad.** Cada función tiene su bloque. El dashboard es una cuadrícula de módulos con ícono + nombre. Entrar a un módulo es un clic.
2. **El estado siempre es visible.** Caja abierta o cerrada, sesión activa, último backup: el admin nunca debería preguntarse "¿en qué estado estoy?".
3. **Densidad útil, no decorativa.** La información que se necesita está en pantalla; la que no, no existe. Listas y tablas sobre tarjetas apiladas cuando hay datos.
4. **Consistencia como confianza.** El mismo botón primario, el mismo input, el mismo patrón de error en todos los módulos. La familiaridad es una feature.
5. **Mobile es consulta, desktop es captura.** Las pantallas de búsqueda y reporte funcionan perfectamente en 390px. Los formularios de captura son secundarios en mobile.

## Accessibility & Inclusion

- Touch targets mínimos 44×44px (Apple HIG) en todos los controles de navegación y botones frecuentes.
- Contraste WCAG AA en light mode y dark mode.
- `prefers-reduced-motion` respetado: transiciones desactivadas si el usuario lo prefiere.
- Fuente base 16px, escala de tipografía fija (rem), sin fluid type.
