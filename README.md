# SHORTCOIN

Un terminal de **position short** sur les coins de **Robinhood Chain** — les tokens natifs de la
chaîne et ceux du launchpad Pons. Les actions tokenisées ne sont pas listées : le produit ne vend
pas de short sur une action.

> Pariez à la baisse sur n'importe quel token éligible. Perte plafonnée à votre collatéral, gain
> plafonné à 100%.

Ce n'est **pas** un short classique : rien n'est emprunté, rien n'est vendu sur le pool. C'est un
pari bilatéral entièrement préfinancé, structurellement un **put spread à barrière** (un turbo put
on-chain). La spécification de référence est [`SPEC-FRONTEND.md`](SPEC-FRONTEND.md).

---

## Le produit en une formule

L'utilisateur dépose un collatéral `C` en USDG. Le notionnel est `N = 2C`, le prix d'entrée
`P₀ = min(spot, TWAP)`. La valeur de la position :

```
V(P) = clamp( N × (B − P) / (B − K) , 0 , N )      B = barrière, K = plafond
```

Pour la première tranche (`K = 0.5·P₀`, `B = 1.5·P₀`) c'est exactement la formule du spec,
`N × (1.5·P₀ − P) / P₀`. La forme générale est celle du code, parce que `capPct` et `barrierPct`
viennent du quoter et ne sont jamais codés en dur.

| Prix | V(P) | PnL |
| --- | --- | --- |
| `0.5·P₀` (plafond) | `2C` | `+C` |
| `P₀` | `C` | `0` |
| `1.5·P₀` (barrière, knock-out) | `0` | `−C` |

Un premium quotidien est prélevé sur le collatéral, donc le breakeven dérive vers le bas chaque
jour. Le payout se règle sur le **plus haut** des TWAP 24h et 72h, le knock-out se déclenche sur le
**plus bas** — jamais sur le spot.

---

## Lancer

```bash
npm install
npm run dev
```

| Script | Rôle |
| --- | --- |
| `npm run dev` | Serveur de dev sur :3000 |
| `npm run build` | Build de production |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Protocole, recherche et univers de tokens |

### Mode (SPEC §7.4)

```bash
NEXT_PUBLIC_MODE=paper     # défaut — tout tourne dans le navigateur
NEXT_PUBLIC_MODE=testnet   # lit l'indexeur à NEXT_PUBLIC_INDEXER_URL
NEXT_PUBLIC_MODE=mainnet
```

Même interface sur les trois. Le mode paper est une implémentation de l'interface d'adaptateur,
pas un chemin de code parallèle.

---

## Écrans

| Route | Contenu | Spec |
| --- | --- | --- |
| `/` | Liste : statut, capacité restante, premium/jour, « ouvrables maintenant » par défaut | §3 |
| `/t/[symbol]` | Fiche token + ticket d'ouverture + graphe de payoff | §4A |
| `/t/0x…` | Même fiche pour une adresse ; « pas de pool suivi » si elle n'est pas indexée | §3 |
| `/positions` | Positions, double marque règlement / spot, échantillons de marquage | §4B |
| `/receipts/[id]` | Reçu de règlement ou de knock-out, exportable JSON / CSV | §4C |
| `/hlp` | Dépôt, retrait, réservé / non réservé, lockup, drawdown maximal | §4D |
| `/how-it-works` | Les 7 sections du plan imposé | §2 |

Le portail de risque (§4E) s'affiche une fois, au premier passage. Les notifications de knock-out
(§7.6) arrivent en toast, et en notification navigateur si l'onglet est masqué.

---

## Architecture

```
lib/protocol/
  types.ts        contrats de données du §6, bigint de bout en bout
  adapter.ts      interface ProtocolAdapter + erreurs décodées
  paper.ts        mode paper : quoter, courbe de taux, réservation, keeper, reçus
  indexer.ts      testnet / mainnet : carte des endpoints + client typé
  runtime.ts      flag de mode, singleton, couche de restriction (§7.7)
  series.ts       série de prix canonique et TWAP pondérés par le temps
  status.ts       machine à états d'éligibilité (10 statuts)
  payoff.ts       formules — graphe et contrôle de cohérence uniquement
  fixed.ts        bigint, 1e18, formatMicroPrice (0.0₇42)
lib/i18n/         FR (référence) et EN, vocabulaire imposé du §2
components/
  scanner/        la liste et le flux de lancements
  token/          fiche token, graphe spot + TWAP
  ticket/         ticket d'ouverture, graphe de payoff
  positions/      positions dépliables
  receipts/       reçus, série d'échantillons
  hlp/            écran HLP
  shell/          nav, recherche, portail de risque, notifications
```

**Le front ne calcule jamais** le prix d'entrée, le premium ni la capacité : il affiche le devis.
`payoff.ts` sert au graphe et à un `console.warn` en dev si le devis s'écarte des formules.

Toute la calibration du mode paper est dans `PAPER_CONFIG` (`lib/protocol/paper.ts`) : capacité
`k × profondeur`, coude de la courbe de taux, délai d'éligibilité, TTL des devis, lockup HLP.

---

## Ce qui est réel, ce qui est simulé

- **Réel** : les symboles, noms, dates de lancement et adresses des coins natifs et des tokens
  Pons ; la lecture d'identité d'une adresse inconnue sur le RPC de Robinhood Chain.
- **Simulé** (mode paper) : prix, profondeur, capacité, taux, trésors, HLP, clusters de wallets,
  positions, règlements. Le mode paper est annoncé sur le ticket, au-dessus du bouton d'ouverture.

## Ce qui reste à décider

Voir [`docs/OPEN-QUESTIONS.md`](docs/OPEN-QUESTIONS.md).
