# Hochwasserportal

Trae a Gladys los **niveles, caudales y niveles de alerta de crecida de las estaciones de los
Länder alemanes**: los ríos más pequeños que vigilan los centros de crecidas de los Länder
(Isar, Neckar, Lahn, Ruhr, Mulde…), con sus **niveles de alerta oficiales** (Meldestufen 1 a 4).
Los datos proceden de los portales de los Länder reunidos en el **Länderübergreifendes
Hochwasserportal** (LHP, hochwasserzentralen.de). Sin cuenta, sin clave.

Länder admitidos: **Baviera, Baden-Wurtemberg, Sajonia, Renania del Norte-Westfalia, Hesse y
Renania-Palatinado** (unas 2.100 estaciones, 900 de ellas con niveles de alerta).

> **No es un servicio de alerta.** Los datos pueden llegar tarde, faltar o ser erróneos, y la
> integración depende de su Gladys, de su acceso a Internet y de servicios públicos. En caso de
> crecida, siga los avisos oficiales (el centro de crecidas de su Land, su municipio, el 112).
> Sin afiliación con los centros de crecidas de los Länder.

Diferencia con la integración **PEGELONLINE**: PEGELONLINE cubre las vías navegables federales
(Rin, Elba, Danubio, canales) con sus niveles medios y de navegación; esta cubre las estaciones
de los Länder, con los niveles de alerta que publican los Länder. Ambas pueden funcionar a la
vez.

## Lo que obtiene

- **Un dispositivo por estación** seguida: el **nivel del agua** (en cm, como en el portal del
  Land; en m sobre el nivel del mar para lagos y embalses), el **caudal** en m³/s cuando la
  estación lo mide, el **nivel de alerta de crecida** de 0 (sin crecida) a 4 cuando el Land
  clasifica la estación, la **tendencia** (sube, estable, baja) y la fecha de la última
  medición.
- Una estación que deja de enviar datos se muestra como tal («Sin nueva medición desde el…»):
  un valor antiguo nunca se envía de nuevo como si fuera reciente.
- Cuatro **disparadores de escena**: el nivel de alerta sube, el nivel de alerta baja, una
  estación deja de enviar mediciones, y vuelve a enviarlas.
- Un **widget de panel**: sus estaciones, su nivel y su tendencia, coloreadas según su nivel de
  alerta.
- Un botón **«Buscar estaciones»** que enumera las estaciones alrededor de su casa, por nombre,
  por río o por identificador, con su nivel actual.

## Requisitos

- Gladys Assistant **5.1.0** o posterior.
- Acceso a Internet desde Gladys: la integración lee los portales de los Länder
  (`www.hnd.bayern.de`, `www.hvz.baden-wuerttemberg.de`, `www.umwelt.sachsen.de`,
  `www.hochwasserportal.nrw`, `www.hlnug.de`, `hochwasser.rlp.de`) y el mapa del LHP
  (`www.hochwasserzentralen.de`) para las coordenadas.
- Para «Alrededor de mi casa»: la ubicación de su casa en Gladys (Ajustes, Casas). La
  integración la pide en la instalación (permiso «ubicación»). Solo se usa dentro del
  contenedor para encontrar las estaciones más cercanas: nunca se envía a un portal, nunca se
  guarda ni se registra.

## Configuración

### Ajustes

- **Estaciones**: identificadores, números o nombres de estaciones, separados por comas. El
  identificador es el código del Land, un guion bajo y el número de la estación: `BY_16005701`
  (München, Isar). Es el de la integración de Home Assistant «hochwasserportal»: una lista de
  Home Assistant se pega tal cual. Un nombre puede llevar su río: `Plochingen Neckar`,
  `Marburg / Lahn`; las mayúsculas, los acentos y las diéresis no cuentan (`Muenchen` encuentra
  `München`).
- **Alrededor de mi casa**: seguir también las 3 estaciones más cercanas que envían
  mediciones, a 10, 20 o 50 km. Solo cuentan las estaciones con coordenadas conocidas: todas en
  Baden-Wurtemberg, Renania del Norte-Westfalia y Hesse, las estaciones de aviso de crecidas
  del mapa del LHP en Baviera, Sajonia y Renania-Palatinado.
- **Intervalo de actualización**: 15 (por defecto), 20 o 30 minutos. La mayoría de las
  estaciones envían una medición cada 15 minutos.
- **Idioma de los nombres de las funciones**: nombres de las funciones de los nuevos
  dispositivos (francés por defecto) e idioma de los textos (tendencia, última medición) y de
  las variables de escena.

Guarde, abra la pestaña **Descubrir** y cree los dispositivos que desee.

### Encontrar sus estaciones

El botón **Buscar estaciones** de la configuración enumera hasta 10 estaciones con su
identificador, su río, su distancia a su casa y su nivel actual:

- vacío: las estaciones alrededor de su casa (20 km, o la distancia elegida);
- un nombre o un río: `München`, `Isar`, `Neckar Plochingen`;
- un Land: `BY_`, `SN_`…;
- un identificador o un número: `BY_16005701`, `16005701`.

Copie los identificadores en **Estaciones** y guarde. También puede encontrar una estación en
el portal de su Land (vea «Fuentes de datos») y tomar su número de la dirección de su página.

## Dispositivos

Cada dispositivo se llama «Estación / Río» (`München / Isar`), modelo «Hochwasserportal ·
Bayern». Sus funciones, cuando la estación las tiene:

| Función                            | Tipo en Gladys      | Valor                                    |
| ---------------------------------- | ------------------- | ---------------------------------------- |
| Nivel del agua                     | Profundidad (cm, m) | como en el portal del Land               |
| Caudal (m³/s)                      | Caudal de agua      | m³/s (Gladys no tiene unidad m³/s)       |
| Nivel de alerta de crecida (0 a 4) | Nivel de riesgo     | 0 sin crecida, 1 a 4 el nivel de alerta  |
| Tendencia                          | Texto               | Sube, Estable, Baja (en una hora aprox.) |
| Última medición                    | Texto               | fecha, o «Sin nueva medición desde el…»  |

El **nivel de alerta** es el del Land: Meldestufe en Baviera, Baden-Wurtemberg, Hesse y
Renania-Palatinado, Alarmstufe en Sajonia, Informationsstufe en Renania del Norte-Westfalia
(3 niveles allí y en Hesse). Baviera y Sajonia publican el nivel en sí; para los demás Länder,
se calcula a partir de los umbrales oficiales que publica el Land, como hace la integración de
Home Assistant. Una estación sin niveles de alerta no tiene esta función.

Un umbral propio («el Lahn por encima de 300 cm») es una condición de escena nativa de Gladys
sobre la función **Nivel del agua**: no hace falta ningún disparador de la integración.

## Widget de panel

Añada el widget **Hochwasserportal** a un panel.

- Sin ajuste: una línea por estación (10 como máximo), su nivel y su tendencia, coloreada según
  su nivel de alerta (verde 0, naranja 1 y 2, rojo 3 y 4, gris sin nivel o sin medición
  reciente). Un título nombra las estaciones en alerta.
- Con una estación elegida: su nivel y su caudal en directo, su nivel de alerta, su tendencia y
  su última medición, y un botón a su página en el portal del Land.

## Disparadores de escena

- **Nivel de alerta alcanzado o agravado**: el nivel de alerta de una estación sube. Filtro por
  estación y por nuevo nivel (1 a 4).
- **Nivel de alerta reducido**: el nivel de alerta baja. Filtro por estación y por nuevo nivel
  (0 a 3).
- **La estación ya no envía mediciones**: ninguna medición nueva desde hace 6 horas (avería,
  mantenimiento, estación dañada por una crecida…).
- **La estación vuelve a enviar mediciones**.

Variables: nombre de la estación, río, Land, nivel nuevo y anterior (número y en palabras),
nivel del agua y su unidad, caudal; la fecha de la última medición para los dos últimos.

## Ejemplos de escenas

- **Crecida del Isar**: disparador «Nivel de alerta alcanzado o agravado», estación München /
  Isar, nivel 2, 3 o 4 → enviar el mensaje «{{triggerEvent.data.station_name}}:
  {{triggerEvent.data.level_name}}, {{triggerEvent.data.height}} cm» y encender una luz en
  rojo.
- **Fin de la alerta**: disparador «Nivel de alerta reducido», nivel 0 → mensaje «Vuelta a la
  normalidad en {{triggerEvent.data.station_name}}».
- **Su propio umbral**: disparador de Gladys «una función cambia», Nivel del agua de Marburg /
  Lahn por encima de 350 → encender la bomba del sótano, avisar.
- **Estación muda durante una crecida**: disparador «La estación ya no envía mediciones» →
  mensaje «Sin datos de {{triggerEvent.data.station_name}} desde el
  {{triggerEvent.data.last_reading}}».

## Fuentes de datos, licencia y cuotas

- Baviera: Hochwassernachrichtendienst Bayern (Bayerisches Landesamt für Umwelt),
  www.hnd.bayern.de, una página para todas las estaciones.
- Baden-Wurtemberg: Hochwasservorhersagezentrale (LUBW), www.hvz.baden-wuerttemberg.de, un
  archivo para todas las estaciones.
- Sajonia: Landeshochwasserzentrum (LfULG), www.umwelt.sachsen.de, una página para todas las
  estaciones.
- Renania del Norte-Westfalia: Hochwasserportal NRW (LANUK), un archivo por estación.
- Hesse: HLNUG, un archivo por estación y parámetro, los umbrales una vez al día.
- Renania-Palatinado: Hochwassermeldedienst (LfU), hochwasser.rlp.de, una solicitud por
  estación.
- Coordenadas: el mapa del Länderübergreifendes Hochwasserportal, una vez por semana.

Los datos son públicos y se leen sin cuenta; la integración consulta cada 15 minutos como
máximo, se identifica en sus solicitudes (User-Agent) y guarda las listas de estaciones una
semana en memoria. Los portales no publican condiciones de uso de API: le rogamos que no reduzca
el intervalo. Créditos: la lectura sigue la biblioteca Python
[lhpapi](https://github.com/stephan192/lhpapi) (Apache 2.0) de la integración de Home Assistant
«hochwasserportal».

## Solución de problemas

- **«Estación desconocida»**: compruebe el identificador con «Buscar estaciones». Los Länder
  distintos de los seis anteriores aún no se admiten.
- **«El portal de … no responde»**: ese portal está caído o ha cambiado; los demás Länder
  siguen. Las mediciones volverán con él. Si dura, abra una issue: los portales son páginas web
  y su formato puede cambiar.
- **Sin nivel de alerta en una estación**: el Land no clasifica esa estación (no es una
  estación de aviso de crecidas).
- **«Sin nueva medición desde el…»**: la estación no envía nada (avería, mantenimiento, hielo).
  Algunas estaciones envían sus valores por lotes, con unas horas de retraso.
- **«Alrededor de mi casa» no añade nada**: ninguna estación con coordenadas conocidas a esa
  distancia; elija una distancia mayor o escriba las estaciones.
- Registros: `LOG_LEVEL=debug` muestra cada ciclo de actualización.

## Límites

- Seis Länder de dieciséis: Berlín, Brandeburgo, Bremen, Hamburgo, Mecklemburgo-Pomerania
  Occidental, Baja Sajonia, Sarre, Sajonia-Anhalt, Schleswig-Holstein y Turingia aún no se
  admiten (vea el README).
- Los portales de Baviera y Sajonia son páginas web leídas como tales: un cambio de su diseño
  detiene sus mediciones hasta que se actualice la integración.
- Sin caudal en Renania del Norte-Westfalia (no publicado como archivo), sin previsión.
- La tendencia necesita aproximadamente una hora de mediciones tras el arranque.
- 20 estaciones como máximo desde la configuración.
