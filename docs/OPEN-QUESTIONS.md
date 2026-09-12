# Questions ouvertes

Points où le spec laisse une ambiguïté, ou qui sont explicitement des décisions produit (§7). Pour
chacun : ce que le front fait aujourd'hui, et pourquoi c'est à trancher.

## 1. Démarrage en perte en tendance baissière

`P₀ = min(spot, TWAP)` et le payout se règle sur `max(TWAP24, TWAP72)`. Quand le token baisse,
les TWAP traînent au-dessus du spot : une position ouverte à ce moment est **marquée sous son
collatéral dès l'ouverture**, et le reste tant que les TWAP n'ont pas rattrapé.

Observé en paper sur CASHCAT : ouverture à 250 USDG, équité affichée 174,95 USDG une seconde
après (−30 %).

C'est cohérent avec l'intention anti-manipulation du spec, mais c'est très surprenant pour
l'utilisateur. Le ticket l'annonce maintenant avant le bouton (« la position démarrerait marquée à
−30 % de son collatéral »). À trancher : est-ce voulu, ou `P₀` devrait-il être le prix de règlement
courant (`max(TWAP24, TWAP72)`) quand il est au-dessus du spot ?

## 2. Base de calcul du premium

Le spec dit que le premium est « prélevé sur le collatéral » mais pas sur quelle base il est
calculé. Le mode paper applique le taux quotidien au **collatéral** `C`. S'il s'applique au
notionnel `N`, tous les coûts affichés doublent. Un seul endroit à changer côté front
(`dailyPremium` dans `open-ticket.tsx`), mais le quoter devrait idéalement renvoyer le coût
projeté plutôt que laisser le front le déduire.

## 3. `TREASURY_EXHAUSTED` et `REDUCE_ONLY`

Le spec dit « trésor épuisé = passage en REDUCE_ONLY » mais liste aussi un statut
`TREASURY_EXHAUSTED`. Le front les traite comme deux statuts aux mêmes permissions (plus
d'ouverture, les positions courent) : `TREASURY_EXHAUSTED` quand le trésor du token est à zéro,
`REDUCE_ONLY` quand c'est une décision de gouvernance. À confirmer.

## 4. Fermeture avant l'éligibilité au payout

Le spec dit qu'une position n'est éligible au payout qu'après un délai, sans dire ce que rapporte
une fermeture avant. Le mode paper rend `min(V(P), C) − premium` : le collatéral, jamais le gain.
Le ticket et la ligne de position le disent.

## 5. Géoblocage (§7.7)

La couche existe (`accessPolicy` dans `lib/protocol/runtime.ts`, configurée par
`NEXT_PUBLIC_RESTRICTED_REGIONS`) et chaque ouverture la consulte. Deux décisions manquent : **qui**
est restreint, et **d'où vient la région** — elle doit venir d'un en-tête posé par l'hébergeur,
pas de la langue du navigateur. En l'absence de région, le front refuse l'ouverture hors mode paper.

## 6. Données de concentration (§7.3)

Le champ `concentration` existe sur chaque `TokenRow` avec une `source`. En paper il vaut `mock`
et l'écran l'affiche comme « donnée simulée ». Le pipeline d'analyse de clusters n'existe pas.

## 7. Écritures on-chain (§7.5)

Le cycle devis → autorisation USDG → simulation → envoi est en place côté UI et en paper.
En testnet / mainnet, toutes les écritures renvoient `WalletNotConnected` : pas de wallet, pas de
Permit2, pas d'ABI des erreurs custom. Le décodage (`decodeError`) attend des erreurs nommées
`CapacityExceeded()`, `QuoteExpired()`, etc. — à aligner sur l'ABI réelle.

## 8. Indexeur (§7.2)

Les endpoints attendus sont listés en tête de `lib/protocol/indexer.ts`. Ils sont une proposition,
à valider avec l'équipe backend avant que l'un ou l'autre ne les implémente.

## 9. Achat et vente spot

`SPEC-FRONTEND.md` décrit un produit short uniquement ; la décision d'ajouter l'achat et la vente du
token lui-même est postérieure et le spec ne la couvre pas. Le front a donc un ticket
**Acheter / Vendre / Short** sur la fiche token et un onglet **Portefeuille** dans Positions.

En paper, un swap est coté contre un pool à produit constant dont la réserve USDG est la profondeur du
token : impact `x / (R + x)`, frais de 30 bps en USDG, tolérance de slippage 0,5 / 1 / 3 %, refus
`SlippageExceeded` si le prix a bougé au-delà du minimum reçu. La moitié de l'impact reste dans le prix.

À trancher avec le backend :
- **Routage** : quels pools (Pons, DEX de la chaîne), agrégateur ou non, qui fixe les frais.
- **Autorisations** : Permit2 ou approve classique pour le routeur, et si c'est la même autorisation que
  celle du collatéral short.
- **Interaction avec le short** : un achat pousse le spot, donc les TWAP, donc rapproche la barrière de
  ses propres positions short sur le même token. Les TWAP amortissent, mais faut-il avertir, voire
  bloquer, l'achat d'un token sur lequel le compte est short ?
- **Portefeuille** : les tokens détenus peuvent-ils servir de collatéral, et le coût moyen doit-il
  intégrer les frais (c'est le cas en paper) ?
- **Endpoints indexeur** : `quoteSwap`, `listHoldings`, `listTrades` renvoient `IndexerUnavailable`
  dans `lib/protocol/indexer.ts` tant que la source n'est pas choisie.
