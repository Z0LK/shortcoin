# Spec frontend — terminal de short sur tokens

Document destiné à l'agent qui développe le front. Il décrit le produit, le vocabulaire imposé,
les écrans à ajouter à l'existant, les contrats de données, et les dépendances qui manquent encore.

L'existant : un terminal avec liste de tokens et une recherche par nom ou par adresse.
Tout ce qui suit s'ajoute autour de ça.

---

## 1. Le produit, à comprendre avant d'écrire une ligne

### Ce que ce n'est pas

Ce n'est **pas** un short classique. L'utilisateur n'emprunte pas de tokens, n'en vend pas,
et le protocole n'exécute aucune transaction sur le pool. C'est exactement ce qui permet au
produit de fonctionner sur des tokens illiquides où un short normal serait impossible.

### Ce que c'est

Un pari bilatéral entièrement préfinancé, structurellement équivalent à un **put spread à barrière**
(l'équivalent on-chain d'un turbo put).

L'utilisateur dépose un collatéral `C` en USDG. Le contrat ouvre un notionnel `N = 2C` à un prix
d'entrée `P₀ = min(spot, TWAP)`. Le protocole gèle `C` dans le trésor du token : c'est le maximum
qu'il pourra jamais verser sur cette position. Aucune dette n'est possible par construction.

Valeur de la position :

```
V(P) = clamp( N × (1.5·P₀ − P) / P₀ , 0 , N )
```

Trois points de repère, avec `N = 2C` :

| Prix | V(P) | PnL utilisateur |
|---|---|---|
| `0.5·P₀` (−50%, plafond) | `2C` | `+C` |
| `P₀` | `C` | `0` |
| `1.5·P₀` (barrière) | `0` | `−C` |

Au-delà de −50%, le gain ne monte plus : le plafond est dur. À +50%, la position est
**knock-out** : le collatéral est saisi, il n'y a rien à racheter, aucun carnet d'ordres n'est
touché. C'est pour ça que le protocole ne porte aucun risque directionnel.

Un **premium quotidien** est prélevé sur le collatéral tant que la position vit. Conséquence à
afficher explicitement : le seuil d'équité nulle dérive vers le bas jour après jour.

```
équité        = V(P) − premium_cumulé
prix_breakeven = P₀ × (1.5 − (C + premium_cumulé) / N)
prix_équité_nulle = P₀ × (1.5 − premium_cumulé / N)
```

### Prix de règlement : jamais le spot

- Le **payout** se règle sur le **plus haut** des TWAP 24h et 72h.
- Le **knock-out** se déclenche sur le **plus bas** des deux.
- La fenêtre s'allonge automatiquement si les ventes nettes dépassent un seuil rapporté à la
  profondeur du pool.
- Une position n'est éligible au payout qu'après un délai post-ouverture.

C'est une décision anti-manipulation, pas un détail d'implémentation. L'utilisateur verra un spot
différent sur DexScreener et croira à un bug. **L'UI doit anticiper ça partout** (voir §5).

### Capacité, taux, garants

Chaque token a une capacité maximale exprimée en **notionnel rapporté à la profondeur du pool**
(jamais en dollars de réserve). Le taux quotidien suit une courbe d'utilisation type Aave : un taux
de base par token (volatilité, drift mesuré, levier) multiplié par un coude qui rend les dernières
tranches de capacité plusieurs fois plus chères que les premières.

Réservation à l'ouverture, dans l'ordre : trésor du token (alimenté par les frais de trading et les
collatéraux saisis), puis HLP au prorata. Trésor épuisé = passage en `REDUCE_ONLY`.

### Paramètres à ne pas coder en dur

Le levier x2 / plafond −50% / barrière +50% est la première tranche, pas une constante. Toute l'UI
doit être paramétrée par `capPct` et `barrierPct` renvoyés par le quoter. Des paliers de levier
viendront ensuite et ne doivent pas imposer une réécriture.

---

## 2. Vocabulaire

Cohérence stricte : un même mot doit désigner la même chose de la recherche au reçu de règlement.

**À utiliser** — position short, collatéral, notionnel, prix d'entrée, barrière, plafond de gain,
knock-out, premium quotidien, capacité, prix de règlement, TWAP.

**À bannir** — « emprunter », « vendre », « vente à découvert » (au sens emprunt-revente), « liquider »
(qui suggère un rachat sur le marché), « marge », « appel de marge », « levier » sans préciser que
la perte est plafonnée au collatéral, « garanti », « sans risque ».

Le terminal actuel parle de « vendre » un token. À renommer : on **ouvre une position short**.

Les boutons disent ce qui se passe : « Ouvrir la position », pas « Confirmer ». L'action garde le
même nom jusqu'au toast de confirmation.

### Copy prête à l'emploi

Une ligne, pour la home :
> Pariez à la baisse sur n'importe quel token éligible. Perte plafonnée à votre collatéral, gain plafonné à 100%.

Trois points, pour le panneau d'aide du ticket :
> - Vous déposez un collatéral. Il n'y a rien à emprunter et rien à vendre.
> - Le token baisse de 50% : vous doublez. Il monte de 50% : la position est knock-out et le collatéral est perdu.
> - Un premium est prélevé chaque jour sur le collatéral tant que la position est ouverte.

Page « Comment ça marche » — plan imposé, dans cet ordre :
1. Pourquoi ce n'est pas un short classique (aucun emprunt, aucune vente sur le pool)
2. Le schéma de payoff, en graphe
3. Le knock-out, et pourquoi il n'y a jamais de dette
4. Le premium et la dérive du breakeven
5. Pourquoi le règlement se fait sur TWAP et pas sur le spot
6. Qui paie les gagnants (trésor du token, puis HLP)
7. Ce qui peut mal tourner (liste honnête, pas un disclaimer juridique)

Écrire pour quelqu'un qui a déjà tradé des memecoins mais jamais un produit à barrière. Voix active,
phrases courtes, pas de jargon dérivés sans définition à côté.

---

## 3. Ce qu'il faut changer dans l'existant

**La recherche est le premier problème.** Elle accepte n'importe quelle adresse, donc la grande
majorité des tokens cherchés ne seront pas éligibles. Aujourd'hui un token non listé renvoie
probablement « introuvable », ce qui est faux et frustrant.

Une recherche doit toujours résoudre vers un état, jamais vers le vide :

- adresse valide + token indexé → fiche token avec son statut et la raison
- adresse valide + token inconnu → « Ce token n'a pas de pool suivi » + bouton pour demander l'ajout
- adresse invalide → erreur de format, distincte de « introuvable »
- recherche par nom → **plusieurs résultats possibles**, avec l'adresse tronquée visible sur chaque
  ligne et un badge sur les homonymes

Le nom seul ne suffit jamais à identifier un token : les impersonations sont la norme sur un
launchpad. Adresse visible partout, copiable en un clic, et lien explorateur.

**La liste** doit ajouter par ligne : statut d'éligibilité, capacité restante en %, taux quotidien
courant. Filtres : « ouvrables maintenant » par défaut, tri par capacité et par taux.

---

## 4. Écrans à ajouter

### A. Fiche token + ticket d'ouverture (l'écran central)

Colonne gauche : identité du token, adresse, profondeur du pool, statut, graphe de prix avec les
deux TWAP superposés au spot.

Colonne droite, le ticket :

- saisie du collatéral, raccourcis 25/50/75/max, solde USDG
- notionnel dérivé affiché en lecture seule
- **graphe de payoff** : c'est l'outil pédagogique principal. Axe X = variation du token en %,
  axe Y = PnL. Marquer P₀, la barrière, le plafond, le breakeven. Zone hachurée au-delà du plafond
  pour montrer que le gain ne progresse plus. Le graphe se met à jour en direct avec le montant.
- taux quotidien **et** taux marginal, avec le coût sur 1 / 7 / 30 jours
- barre d'utilisation avant/après cette position
- répartition trésor / HLP du backing
- compte à rebours du délai d'éligibilité au payout
- compte à rebours d'expiration du devis
- bouton d'ouverture désactivé avec la raison en clair si le statut l'interdit

Le front **ne calcule jamais** le prix d'entrée, le premium ni la capacité. Il affiche ce que le
quoter renvoie. Les formules de §1 servent uniquement au graphe et à un contrôle de cohérence en
dev (warning console si l'écart dépasse un seuil).

### B. Positions

Une ligne par position, dépliable. Champs indispensables :

- prix d'entrée, prix de règlement courant, **spot affiché à part et grisé**
- distance à la barrière en %, avec la barrière effective qui dérive
- premium cumulé et « autonomie » restante en jours au taux courant
- équité et PnL, en distinguant bien `V(P) − premium` du PnL brut
- badge si la fenêtre de règlement a été étendue, avec la raison
- badge si la position n'est pas encore éligible au payout

Vue détaillée : historique des échantillons de prix qui ont servi au marquage.

### C. Reçu de règlement et de knock-out

Écran souvent oublié, et c'est celui qui décide de la confiance. Un utilisateur knock-out va
contester. Il faut pouvoir montrer :

- la série d'échantillons ayant produit le TWAP déclencheur, horodatée
- lequel des deux TWAP a déclenché, et sa valeur exacte au moment du franchissement
- le hash de la transaction de knock-out et l'adresse du keeper
- le décompte : collatéral, premium cumulé, montant final

Exportable. Ce sont les preuves du règlement, pas un historique décoratif.

### D. HLP

Dépôt / retrait, NAV, prix de la part, utilisation courante, rendement réalisé.

Deux choses doivent être impossibles à rater :

- le capital **réservé** ne peut pas être retiré, seul le non-réservé le peut
- le lockup, avec compte à rebours

Afficher l'exposition par token et le plafond d'utilisation global. Un déposant doit voir son
drawdown maximal théorique, pas seulement le rendement passé.

### E. Portail de risque à la première utilisation

Modale bloquante, une seule fois, avec accusé de réception explicite sur trois points :
knock-out = perte totale du collatéral ; le premium consomme le collatéral dans le temps ; le
règlement se fait sur TWAP et non sur le spot affiché ailleurs.

Pas de mur de texte juridique. Trois cases, trois phrases.

---

## 5. Règles d'affichage non négociables

**Deux marques de prix, toujours.** Partout où un prix apparaît sur une position, le prix de
règlement est le chiffre principal et le spot est secondaire et grisé, avec un tooltip qui explique
en une phrase pourquoi ils diffèrent. Ne jamais afficher le spot seul sur un écran de position.

**Prix microscopiques.** Les tokens de launchpad cotent à `0.000000042` et plus bas. Écrire un
utilitaire `formatMicroPrice` en notation à zéros compactés (`0.0₇42`) et l'utiliser partout, y
compris dans les axes de graphes. Gérer les décimales variables des tokens (9 à 18) et ne jamais
faire transiter un montant en `number` : `bigint` de bout en bout, conversion à l'affichage
uniquement.

**Fraîcheur de l'oracle.** Si le sampler n'a pas été poké récemment, l'ouverture est bloquée avec
un message explicite et un compte à rebours. C'est une condition de sécurité, pas un état d'erreur
générique. À traiter comme un statut de token à part entière.

**Devis périmé.** Un devis a une durée de vie courte. À expiration, requote automatique et
surlignage de ce qui a changé. Si la transaction échoue pour capacité prise entre-temps, requote
automatique avec message clair plutôt qu'une erreur de contrat brute.

---

## 6. Contrats de données

À définir maintenant et à mocker, pour que le front avance sans attendre les contrats.

```ts
type TokenStatus =
  | 'ELIGIBLE'
  | 'WARMUP'                  // historique TWAP insuffisant (jour 1)
  | 'CAPACITY_FULL'           // notionnel ouvert au plafond k × profondeur
  | 'TREASURY_EXHAUSTED'
  | 'REDUCE_ONLY'             // plus d'ouverture, positions existantes courent
  | 'INELIGIBLE_CONCENTRATION'// un cluster de wallets dépasse le seuil
  | 'INELIGIBLE_DEPTH'
  | 'ORACLE_STALE'
  | 'PAUSED'
  | 'UNTRACKED'               // adresse valide, aucun pool suivi

interface TokenStatusInfo {
  status: TokenStatus
  canOpen: boolean
  canClose: boolean
  reason: string              // phrase utilisateur, pas un code
  recheckAt?: number          // unix ms, pour WARMUP et ORACLE_STALE
}

interface TokenRow {
  address: `0x${string}`
  symbol: string
  name: string
  decimals: number
  status: TokenStatusInfo
  quoteDepth: bigint          // profondeur côté USDG
  utilization: number         // 0..1
  remainingNotional: bigint
  dailyRateBps: number
  spotPrice: string           // fixed point 1e18
  twap24h: string
  twap72h: string
  lastSampleAt: number
}

interface OpenQuote {
  quoteId: string
  expiresAt: number
  token: `0x${string}`
  collateral: bigint
  notional: bigint
  entryPrice: string
  entryPriceSource: 'SPOT' | 'TWAP'
  capPct: number              // 0.5 aujourd'hui — ne pas coder en dur
  barrierPct: number          // 1.5 aujourd'hui
  capPrice: string
  barrierPrice: string
  maxPayout: bigint
  dailyRateBps: number
  marginalRateBps: number
  utilizationBefore: number
  utilizationAfter: number
  backing: { treasuryBps: number; hlpBps: number }
  payoutEligibleAt: number
  minSettlementWindowHours: number
}

type PositionStatus = 'OPEN' | 'KNOCKED_OUT' | 'PENDING_SETTLEMENT' | 'SETTLED' | 'CLOSED'

interface Position {
  id: string
  token: `0x${string}`
  status: PositionStatus
  openedAt: number
  collateral: bigint
  notional: bigint
  entryPrice: string
  capPrice: string
  barrierPrice: string
  accruedPremium: bigint
  settlementMark: string      // max(twap24h, twap72h) → régit le payout
  knockoutMark: string        // min(twap24h, twap72h) → régit le knock-out
  spotPrice: string           // affichage secondaire uniquement
  currentValue: bigint        // V(P) sur settlementMark
  equity: bigint              // currentValue − accruedPremium
  pnl: bigint
  distanceToBarrierPct: number
  premiumRunwayDays: number
  payoutEligibleAt: number
  windowExtendedUntil: number | null
  windowExtensionReason?: string
}

interface SettlementReceipt {
  positionId: string
  trigger: 'KNOCKOUT' | 'CAP_REACHED' | 'USER_CLOSE' | 'EXPIRY'
  triggeredBy: 'TWAP24' | 'TWAP72'
  triggerPrice: string
  samples: { at: number; price: string }[]
  txHash: `0x${string}`
  keeper: `0x${string}`
  collateral: bigint
  premiumPaid: bigint
  payout: bigint
}

interface HlpState {
  nav: bigint
  sharePrice: string
  totalShares: bigint
  reserved: bigint
  utilization: number
  utilizationCap: number
  lockupSeconds: number
  perTokenExposure: { token: `0x${string}`; reserved: bigint; capBps: number }[]
}
```

---

## 7. Ce qui manque et qui bloque

Par ordre de blocage. Chaque point est soit une dépendance à stubber derrière une interface, soit
une décision à faire remonter avant de coder.

1. **Le quoter.** Le ticket ne peut pas exister sans lui. Figer la signature dès maintenant et
   développer contre un adaptateur mock. L'adaptateur mock doit être une implémentation complète
   de l'interface, pas des données figées : il doit réagir au montant saisi pour que la courbe de
   taux soit visible en dev.
2. **L'indexeur.** Le front ne lit jamais la chaîne pour construire une liste. Définir les endpoints
   liste / fiche / positions / reçus / HLP.
3. **Les données de concentration.** L'éligibilité dépend de clusters de wallets, qui viennent d'un
   pipeline d'analyse hors-chaîne et non du contrat. Prévoir le champ dès le début même si la source
   n'existe pas encore.
4. **Le flag de mode.** `MODE = paper | testnet | mainnet` en variable d'environnement, avec le même
   UI sur les trois. Le mode paper doit être une implémentation de la même interface d'adaptateur,
   pas un chemin de code parallèle — sinon il divergera en une semaine. C'est ce qui permet de
   valider la demande et de calibrer la courbe de taux avant de déployer quoi que ce soit.
5. **Approbations USDG et Permit2**, plus la simulation de transaction avant envoi et le décodage
   des erreurs custom du contrat en messages lisibles.
6. **Notifications de knock-out.** Un utilisateur knock-out sans avoir été prévenu est un
   utilisateur perdu. Flux d'événements, toast, et alerte optionnelle sur approche de barrière.
7. **Géoblocage.** Un produit à barrière avec effet de levier distribué au retail européen touche
   les mesures ESMA et MiCA. Décision produit à prendre avant le mainnet, pas après. Prévoir la
   couche de restriction dans l'architecture dès maintenant.
8. **i18n FR / EN** dès le départ. Rétrofitter de l'i18n sur une UI financière pleine de chaînes
   composées coûte plusieurs jours.
9. **Mobile.** Les traders de launchpad sont sur téléphone. Le ticket et le graphe de payoff doivent
   être conçus mobile d'abord.

---

## 8. Ordre de construction

1. Types, interface d'adaptateur, mock réactif
2. Machine à états d'éligibilité + refonte de la recherche
3. Fiche token et ticket, avec le graphe de payoff
4. Positions, avec le double affichage TWAP / spot
5. Reçus de règlement
6. HLP
7. Portail de risque, i18n, notifications

Les étapes 1 à 4 sont livrables en mode paper et suffisent à tester le produit avec de vrais
utilisateurs.

---

## 9. Hors périmètre

- Pas de carnet d'ordres, pas de matching : il n'y a pas de contrepartie utilisateur à afficher.
- Pas de shorts couverts avec escrow de tokens : cette branche a été abandonnée.
- Pas de calcul de premium ou de capacité côté client.
- Pas de graphe AMM reconstruit maison : intégrer une source existante.
- Pas d'enchères de surplus ni de buyback dans cette version.
