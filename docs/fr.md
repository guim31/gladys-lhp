# Hochwasserportal

Apporte dans Gladys les **hauteurs d'eau, débits et niveaux d'alerte crue des stations des
Länder allemands** : les petites rivières que surveillent les centres de prévision des crues
des Länder (Isar, Neckar, Lahn, Ruhr, Mulde…), avec leurs **niveaux d'alerte officiels**
(Meldestufen 1 à 4). Les données viennent des portails des Länder réunis dans le
**Länderübergreifendes Hochwasserportal** (LHP, hochwasserzentralen.de). Sans compte, sans clé.

Länder pris en charge : **Bavière, Bade-Wurtemberg, Saxe, Rhénanie-du-Nord-Westphalie, Hesse et
Rhénanie-Palatinat** (environ 2 100 stations, dont 900 avec niveaux d'alerte).

> **Pas un service d'alerte.** Les données peuvent être en retard, manquantes ou fausses, et
> l'intégration dépend de votre Gladys, de votre accès Internet et de services publics. En cas
> de crue, suivez les alertes officielles (le centre de prévision de votre Land, votre commune,
> le 112). Cette intégration est non affiliée aux centres de prévision des crues des Länder.

Différence avec l'intégration **PEGELONLINE** : PEGELONLINE couvre les voies navigables
fédérales (Rhin, Elbe, Danube, canaux) avec leurs niveaux moyens et de navigation ; celle-ci
couvre les stations des Länder, avec les niveaux d'alerte que publient les Länder. Les deux
peuvent tourner ensemble.

## Ce que vous obtenez

- **Un appareil par station** suivie : la **hauteur d'eau** (en cm, comme sur le portail du
  Land ; en m d'altitude pour les lacs et retenues), le **débit** en m³/s quand la station le
  mesure, le **niveau d'alerte crue** de 0 (pas de crue) à 4 quand le Land classe la station,
  la **tendance** (monte, stable, baisse) et la date de la dernière mesure.
- Une station qui n'envoie plus rien est signalée comme telle (« Pas de nouvelle mesure
  depuis… ») : une ancienne valeur n'est jamais renvoyée comme si elle était fraîche.
- Quatre **déclencheurs de scène** : le niveau d'alerte monte, le niveau d'alerte baisse, une
  station n'envoie plus de mesures, et en envoie de nouveau.
- Un **widget de tableau de bord** : vos stations, leur hauteur, sa tendance, en couleur selon
  leur niveau d'alerte.
- Un bouton **« Chercher des stations »** qui liste les stations autour de votre maison, par
  nom, par cours d'eau ou par identifiant, avec leur hauteur actuelle.

## Prérequis

- Gladys Assistant **5.1.0** ou plus récent.
- Un accès Internet depuis Gladys : l'intégration lit les portails des Länder
  (`www.hnd.bayern.de`, `www.hvz.baden-wuerttemberg.de`, `www.umwelt.sachsen.de`,
  `www.hochwasserportal.nrw`, `www.hlnug.de`, `hochwasser.rlp.de`) et la carte du LHP
  (`www.hochwasserzentralen.de`) pour les coordonnées.
- Pour « Autour de ma maison » : la position de votre maison dans Gladys (Paramètres, Maisons).
  L'intégration la demande à l'installation (permission « position »). Elle ne sert que dans le
  conteneur à trouver les stations les plus proches : jamais envoyée à un portail, jamais
  enregistrée ni journalisée.

## Configuration

### Réglages

- **Stations** : identifiants, numéros ou noms de stations, séparés par des virgules.
  L'identifiant est le code du Land, un tiret bas et le numéro de la station : `BY_16005701`
  (München, Isar). C'est celui de l'intégration Home Assistant « hochwasserportal » : une liste
  venue de Home Assistant se colle telle quelle. Un nom peut porter son cours d'eau :
  `Plochingen Neckar`, `Marburg / Lahn` ; la casse, les accents et les umlauts ne comptent pas
  (`Muenchen` trouve `München`).
- **Autour de ma maison** : suivre aussi les 3 stations les plus proches qui envoient des
  mesures, à 10, 20 ou 50 km. Seules comptent les stations aux coordonnées connues : toutes en
  Bade-Wurtemberg, Rhénanie-du-Nord-Westphalie et Hesse, les stations d'annonce de crue de la
  carte du LHP en Bavière, Saxe et Rhénanie-Palatinat.
- **Fréquence de mise à jour** : 15 (par défaut), 20 ou 30 minutes. La plupart des stations
  envoient une mesure toutes les 15 minutes.
- **Langue des noms de fonctionnalités** : noms donnés aux fonctionnalités des nouveaux
  appareils (français par défaut), et langue des textes (tendance, dernière mesure) et des
  variables de scène.

Enregistrez, puis ouvrez l'onglet **Découverte** et créez les appareils voulus.

### Trouver vos stations

Le bouton **Chercher des stations** de la configuration liste jusqu'à 10 stations avec leur
identifiant, leur cours d'eau, leur distance à votre maison et leur hauteur actuelle :

- vide : les stations autour de votre maison (20 km, ou la distance choisie) ;
- un nom ou un cours d'eau : `München`, `Isar`, `Neckar Plochingen` ;
- un Land : `BY_`, `SN_`… ;
- un identifiant ou un numéro : `BY_16005701`, `16005701`.

Copiez les identifiants dans **Stations**, puis enregistrez. Vous pouvez aussi trouver une
station sur le portail de son Land (voir « Sources des données ») et relever son numéro dans
l'adresse de sa page.

## Appareils

Chaque appareil s'appelle « Station / Cours d'eau » (`München / Isar`), modèle
« Hochwasserportal · Bayern ». Ses fonctionnalités, quand la station les a :

| Fonctionnalité               | Type dans Gladys             | Valeur                                        |
| ---------------------------- | ---------------------------- | --------------------------------------------- |
| Hauteur d'eau                | Profondeur du liquide (cm,m) | comme sur le portail du Land                  |
| Débit (m³/s)                 | Débit d'eau                  | m³/s (Gladys n'a pas d'unité m³/s)            |
| Niveau d'alerte crue (0 à 4) | Niveau de risque             | 0 pas de crue, 1 à 4 le niveau d'alerte       |
| Tendance                     | Texte                        | Monte, Stable, Baisse (sur environ une heure) |
| Dernière mesure              | Texte                        | date, ou « Pas de nouvelle mesure depuis… »   |

Le **niveau d'alerte** est celui du Land : Meldestufe en Bavière, Bade-Wurtemberg, Hesse et
Rhénanie-Palatinat, Alarmstufe en Saxe, Informationsstufe en Rhénanie-du-Nord-Westphalie
(3 niveaux là-bas et en Hesse). La Bavière et la Saxe publient le niveau lui-même ; pour les
autres Länder, il est calculé à partir des seuils officiels que publie le Land, comme le fait
l'intégration Home Assistant. Une station sans niveaux d'alerte n'a pas cette fonctionnalité.

Un seuil à vous (« la Lahn au-dessus de 300 cm ») est une condition de scène native de Gladys
sur la fonctionnalité **Hauteur d'eau** : aucun déclencheur de l'intégration n'est nécessaire.

## Widget de tableau de bord

Ajoutez le widget **Hochwasserportal** à un tableau de bord.

- Sans réglage : une ligne par station (10 au plus), sa hauteur et sa tendance, en couleur
  selon son niveau d'alerte (vert 0, orange 1 et 2, rouge 3 et 4, gris sans niveau ou sans
  mesure récente). Un titre nomme les stations en alerte.
- Avec une station choisie : sa hauteur et son débit en direct, son niveau d'alerte, sa
  tendance et sa dernière mesure, et un bouton vers sa page sur le portail du Land.

## Déclencheurs de scène

- **Niveau d'alerte crue atteint ou aggravé** : le niveau d'alerte d'une station monte. Filtre
  par station et par nouveau niveau (1 à 4).
- **Niveau d'alerte crue retombé** : le niveau d'alerte baisse. Filtre par station et par
  nouveau niveau (0 à 3).
- **La station n'envoie plus de mesures** : aucune nouvelle mesure depuis 6 heures (panne,
  maintenance, station endommagée par une crue…).
- **La station envoie de nouveau des mesures**.

Variables : nom de la station, cours d'eau, Land, nouveau et ancien niveau (nombre et en
toutes lettres), hauteur d'eau et son unité, débit ; la date de la dernière mesure pour les
deux derniers.

## Exemples de scènes

- **Crue de l'Isar** : déclencheur « Niveau d'alerte crue atteint ou aggravé », station
  München / Isar, niveau 2, 3 ou 4 → envoyer le message « {{triggerEvent.data.station_name}} :
  {{triggerEvent.data.level_name}}, {{triggerEvent.data.height}} cm » et allumer une lampe en
  rouge.
- **Fin d'alerte** : déclencheur « Niveau d'alerte crue retombé », niveau 0 → message « Retour à
  la normale à {{triggerEvent.data.station_name}} ».
- **Votre propre seuil** : déclencheur Gladys « une fonctionnalité change », Hauteur d'eau de
  Marburg / Lahn au-dessus de 350 → allumer la pompe de la cave, prévenir.
- **Station muette pendant une crue** : déclencheur « La station n'envoie plus de mesures » →
  message « Plus de données de {{triggerEvent.data.station_name}} depuis le
  {{triggerEvent.data.last_reading}} ».

## Sources des données, licence et quotas

- Bavière : Hochwassernachrichtendienst Bayern (Bayerisches Landesamt für Umwelt),
  www.hnd.bayern.de, une page pour toutes les stations.
- Bade-Wurtemberg : Hochwasservorhersagezentrale (LUBW), www.hvz.baden-wuerttemberg.de, un
  fichier pour toutes les stations.
- Saxe : Landeshochwasserzentrum (LfULG), www.umwelt.sachsen.de, une page pour toutes les
  stations.
- Rhénanie-du-Nord-Westphalie : Hochwasserportal NRW (LANUK), un fichier par station.
- Hesse : HLNUG, un fichier par station et par paramètre, les seuils une fois par jour.
- Rhénanie-Palatinat : Hochwassermeldedienst (LfU), hochwasser.rlp.de, une requête par station.
- Coordonnées : la carte du Länderübergreifendes Hochwasserportal, une fois par semaine.

Les données sont publiques et lues sans compte ; l'intégration interroge toutes les 15 minutes
au plus, se nomme dans ses requêtes (User-Agent) et garde les listes de stations une semaine en
mémoire. Les portails ne publient pas de conditions d'usage d'API : merci de ne pas réduire
l'intervalle. Crédits : la lecture suit la bibliothèque Python
[lhpapi](https://github.com/stephan192/lhpapi) (Apache 2.0) de l'intégration Home Assistant
« hochwasserportal ».

## Dépannage

- **« Station inconnue »** : vérifiez l'identifiant avec « Chercher des stations ». Les Länder
  autres que les six ci-dessus ne sont pas encore pris en charge.
- **« Le portail de … ne répond pas »** : ce portail est en panne ou a changé ; les autres
  Länder continuent. Les mesures reviendront avec lui. Si cela dure, ouvrez une issue : les
  portails sont des pages web, et leur format peut changer.
- **Pas de niveau d'alerte sur une station** : le Land ne classe pas cette station (ce n'est
  pas une station d'annonce de crue).
- **« Pas de nouvelle mesure depuis… »** : la station n'envoie rien (panne, maintenance, glace).
  Certaines stations envoient leurs valeurs par lots, avec quelques heures de retard.
- **« Autour de ma maison » n'ajoute rien** : aucune station aux coordonnées connues à cette
  distance ; choisissez une distance plus grande ou tapez les stations.
- Journaux : `LOG_LEVEL=debug` montre chaque cycle de mise à jour.

## Limites

- Six Länder sur seize : Berlin, Brandebourg, Brême, Hambourg, Mecklembourg-Poméranie-
  Occidentale, Basse-Saxe, Sarre, Saxe-Anhalt, Schleswig-Holstein et Thuringe ne sont pas
  encore pris en charge (voir le README).
- Les portails de Bavière et de Saxe sont des pages web lues comme telles : un changement de
  leur mise en page arrête leurs mesures jusqu'à une mise à jour de l'intégration.
- Pas de débit en Rhénanie-du-Nord-Westphalie (non publié en fichier), pas de prévision.
- La tendance demande environ une heure de mesures après le démarrage.
- 20 stations au plus depuis la configuration.
