'use client'

/**
 * "How it works" — SPEC §2 imposes the plan, in this order:
 *   1. why this is not a classic short
 *   2. the payoff, as a graph
 *   3. the knock-out, and why there is never any debt
 *   4. the premium and the breakeven drift
 *   5. why settlement runs on TWAP and not spot
 *   6. who pays the winners
 *   7. what can go wrong — an honest list, not a legal disclaimer
 *
 * Written for someone who has traded memecoins but never a barrier product:
 * active voice, short sentences, and any derivatives word defined where it
 * first appears.
 *
 * The long-form copy lives here rather than in the flat dictionaries, but it is
 * still translated: both languages are complete, and the figures come from the
 * current tranche rather than being typed into the prose.
 */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PayoffChart } from '@/components/ticket/payoff-chart'
import { FIRST_TRANCHE } from '@/lib/protocol/payoff'
import { useT, type Locale } from '@/lib/i18n'

const CAP = Math.round((1 - FIRST_TRANCHE.capPct) * 100)
const BARRIER = Math.round((FIRST_TRANCHE.barrierPct - 1) * 100)

interface Section {
  title: string
  body: string[]
  list?: string[]
}

const COPY: Record<Locale, { kicker: string; title: string; lede: string; sections: Section[]; cta: string; example: string }> = {
  fr: {
    kicker: 'Le produit',
    title: 'Parier à la baisse, sans rien emprunter.',
    lede: `Vous déposez un collatéral en USDG. Si le token baisse, vous gagnez, jusqu’à doubler votre mise à −${CAP}%. S’il monte de ${BARRIER}%, vous perdez le collatéral, et rien de plus.`,
    sections: [
      {
        title: 'Pourquoi ce n’est pas un short classique',
        body: [
          'Un short classique, c’est emprunter un token, le vendre, puis le racheter plus bas pour le rendre. Il faut un prêteur, et il faut un pool assez profond pour vendre sans faire chuter le prix.',
          'Ici, rien de tout ça. Vous n’empruntez aucun token. Personne ne vend quoi que ce soit sur le pool. Le protocole n’exécute aucune transaction sur le marché du token.',
          'C’est un pari entièrement préfinancé entre vous et le protocole. C’est pour ça qu’il fonctionne sur des tokens illiquides, là où un short normal serait impossible.',
        ],
      },
      {
        title: 'Le payoff, en graphe',
        body: [
          `Vous déposez un collatéral C. La position a un notionnel N = 2C : c’est la taille sur laquelle votre gain est calculé. Le prix d’entrée P₀ est fixé à l’ouverture.`,
          `Le token baisse de ${CAP}% : votre position vaut 2C, vous avez doublé. Il ne bouge pas : elle vaut C, vous êtes à zéro. Il monte de ${BARRIER}% : elle vaut 0.`,
          `Au-delà de −${CAP}%, le gain ne monte plus. C’est le plafond de gain, et il est dur : un token qui baisse de 90% vous rapporte autant qu’un token qui baisse de ${CAP}%.`,
        ],
      },
      {
        title: 'Le knock-out, et pourquoi il n’y a jamais de dette',
        body: [
          `Quand le token monte de ${BARRIER}%, la position est knock-out. « Knock-out » veut dire qu’elle s’arrête d’elle-même : le collatéral est gardé par le protocole, la position est fermée.`,
          'Il n’y a rien à racheter et aucun carnet d’ordres n’est touché. Vous ne pouvez pas perdre plus que votre collatéral, parce que votre collatéral est tout ce qui est en jeu.',
          'Pas de dette possible, par construction. Personne ne viendra vous réclamer la différence.',
        ],
      },
      {
        title: 'Le premium, et la dérive du breakeven',
        body: [
          'Chaque jour où la position est ouverte, un premium est prélevé sur votre collatéral. C’est le prix de la couverture que le protocole vous apporte.',
          'Conséquence directe : votre breakeven — le prix auquel vous êtes à zéro — descend un peu chaque jour. Le premier jour, il suffit que le token ne monte pas. Au bout d’un mois, il faut qu’il ait baissé pour que vous soyez à l’équilibre.',
          'Le taux dépend de la capacité utilisée sur le token. Plus elle est pleine, plus les dernières tranches sont chères. Le ticket affiche le taux, le taux marginal et le coût sur 1, 7 et 30 jours avant que vous ouvriez.',
        ],
      },
      {
        title: 'Pourquoi le règlement se fait sur TWAP et pas sur le spot',
        body: [
          'Le spot, c’est le prix instantané du pool. Sur un token illiquide, quelqu’un peut le déplacer pendant quelques secondes avec peu d’argent.',
          'Le protocole ne regarde donc jamais le spot pour régler. Il utilise deux TWAP — des moyennes de prix pondérées par le temps, sur 24 h et sur 72 h.',
          'Votre gain se règle sur le plus haut des deux. Le knock-out se déclenche sur le plus bas des deux. Un pic isolé ne suffit donc ni à vous faire gagner, ni à vous sortir.',
          'Conséquence : vous verrez un prix différent sur DexScreener. Ce n’est pas un bug. Partout où vous voyez une position, le prix de règlement est affiché en premier et le spot en second, en gris.',
        ],
      },
      {
        title: 'Qui paie les gagnants',
        body: [
          'À l’ouverture, le protocole met de côté le maximum qu’il pourrait vous verser. Il le prend d’abord dans le trésor du token, alimenté par les frais de trading et les collatéraux des positions knock-out.',
          'Si le trésor ne suffit pas, le HLP complète. Le HLP est une réserve commune où des déposants mettent des USDG en échange d’une part des premiums.',
          'Quand le trésor d’un token est vide, plus aucune position ne s’ouvre dessus. Les positions existantes continuent de courir.',
        ],
      },
      {
        title: 'Ce qui peut mal tourner',
        body: ['Une liste honnête, pas un paragraphe juridique.'],
        list: [
          `Le token monte de ${BARRIER}% et y reste assez longtemps pour que les TWAP suivent. Vous perdez tout le collatéral.`,
          'Le token ne bouge pas. Vous payez le premium tous les jours et finissez en perte.',
          'Le token baisse, mais pas assez vite. Le premium mange votre gain avant qu’il n’arrive.',
          `Le token baisse de 90%. Vous gagnez, mais pas plus qu’à −${CAP}% : le plafond est dur.`,
          'Vous fermez avant la fin du délai post-ouverture. Vous récupérez au mieux votre collatéral moins le premium, sans le gain.',
          'La fenêtre de règlement s’allonge parce que le pool subit de fortes ventes. Votre règlement arrive plus tard que prévu.',
          'L’oracle n’est pas mis à jour à temps. L’ouverture est bloquée jusqu’au prochain prix frais.',
          'Le code du protocole a un bug. Les contrats sont une dépendance comme une autre, et aucune revue ne rend un bug impossible.',
        ],
      },
    ],
    cta: 'Voir les tokens ouvrables',
    example: 'Exemple : 1 000 USDG de collatéral',
  },
  en: {
    kicker: 'The product',
    title: 'Bet against a token without borrowing anything.',
    lede: `You deposit USDG collateral. If the token falls, you gain — up to double your stake at −${CAP}%. If it rises ${BARRIER}%, you lose the collateral, and nothing more.`,
    sections: [
      {
        title: 'Why this is not a classic short',
        body: [
          'A classic short means borrowing a token, selling it, and buying it back lower to return it. You need a lender, and you need a pool deep enough to take the sale without crashing the price.',
          'None of that happens here. You borrow no token. Nobody trades anything on the pool. The protocol never touches the token’s market.',
          'It is a fully pre-funded bet between you and the protocol. That is why it works on illiquid tokens, where a normal short would be impossible.',
        ],
      },
      {
        title: 'The payoff, as a graph',
        body: [
          'You deposit collateral C. The position has a notional N = 2C — the size your gain is computed on. The entry price P₀ is fixed when you open.',
          `The token falls ${CAP}%: your position is worth 2C, you doubled. It does not move: it is worth C, you are flat. It rises ${BARRIER}%: it is worth 0.`,
          `Past −${CAP}%, the gain stops growing. That is the gain cap, and it is hard: a token that falls 90% pays you the same as one that falls ${CAP}%.`,
        ],
      },
      {
        title: 'The knock-out, and why there is never any debt',
        body: [
          `When the token rises ${BARRIER}%, the position is knocked out. "Knock-out" means it ends by itself: the protocol keeps the collateral and the position closes.`,
          'There is nothing to buy back and no order book is touched. You cannot lose more than your collateral, because your collateral is all that is at stake.',
          'No debt is possible, by construction. Nobody will come asking you for the difference.',
        ],
      },
      {
        title: 'The premium, and the breakeven drift',
        body: [
          'Every day the position is open, a premium is taken from your collateral. It is the price of the cover the protocol provides.',
          'The direct consequence: your breakeven — the price at which you are flat — moves down a little every day. On day one, the token only has to not rise. After a month, it has to have fallen for you to break even.',
          'The rate depends on how much of the token’s capacity is in use. The fuller it is, the more the last slices cost. The ticket shows the rate, the marginal rate and the cost over 1, 7 and 30 days before you open.',
        ],
      },
      {
        title: 'Why settlement runs on TWAP and not spot',
        body: [
          'Spot is the pool’s instant price. On an illiquid token, someone can move it for a few seconds with very little money.',
          'So the protocol never settles on spot. It uses two TWAPs — time-weighted average prices, over 24h and over 72h.',
          'Your gain settles on the higher of the two. The knock-out fires on the lower of the two. A lone spike is not enough to pay you out, or to take you out.',
          'The consequence: DexScreener will show you a different price. That is not a bug. Wherever a position appears, the settlement price comes first and the spot second, in grey.',
        ],
      },
      {
        title: 'Who pays the winners',
        body: [
          'When you open, the protocol sets aside the most it could ever pay you. It takes it from the token’s treasury first, which is funded by trading fees and the collateral of knocked-out positions.',
          'If the treasury is not enough, the HLP tops it up. The HLP is a shared pool where depositors put in USDG in exchange for a share of premiums.',
          'When a token’s treasury is empty, no new position opens on it. Existing positions keep running.',
        ],
      },
      {
        title: 'What can go wrong',
        body: ['An honest list, not a legal paragraph.'],
        list: [
          `The token rises ${BARRIER}% and stays there long enough for the TWAPs to follow. You lose all the collateral.`,
          'The token does not move. You pay the premium every day and end at a loss.',
          'The token falls, but not fast enough. The premium eats your gain before it arrives.',
          `The token falls 90%. You gain, but no more than at −${CAP}%: the cap is hard.`,
          'You close before the post-opening delay ends. You get back at best your collateral minus premium, without the gain.',
          'The settlement window stretches because the pool is under heavy selling. Your settlement arrives later than expected.',
          'The oracle is not updated in time. Opening is blocked until the next fresh price.',
          'The protocol’s code has a bug. The contracts are a dependency like any other, and no review makes a bug impossible.',
        ],
      },
    ],
    cta: 'See openable tokens',
    example: 'Example: 1,000 USDG of collateral',
  },
}

export function HowItWorks() {
  const { locale } = useT()
  const c = COPY[locale]

  return (
    <div className="h-full overflow-y-auto">
      <article className="mx-auto max-w-[780px] px-5 pb-24">
        <header className="rise-in py-14">
          <p className="mono mb-4 flex items-center gap-2 text-[10px] text-acid">
            <span className="pulse-dot size-1.5 rounded-full bg-acid shadow-[0_0_10px_var(--acid)]" />
            {c.kicker}
          </p>
          <h1 className="display text-[clamp(2.1rem,6vw,3.8rem)]">{c.title}</h1>
          <p className="mt-4 text-base leading-relaxed text-ink-2">{c.lede}</p>
        </header>

        {c.sections.map((s, i) => (
          <section key={s.title} className="border-t border-line py-8">
            <div className="mb-3 flex items-baseline gap-3">
              <span className="mono rounded-full border border-line-acid px-2.5 py-1 text-[10px] text-acid">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h2 className="text-[19px] font-semibold tracking-[-0.02em]">{s.title}</h2>
            </div>
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-ink-2">
              {s.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
              {s.list && (
                <ul className="flex flex-col gap-2">
                  {s.list.map((item) => (
                    <li key={item} className="flex gap-2.5">
                      <span className="mt-[3px] size-1.5 shrink-0 rounded-full bg-acid" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
              {i === 1 && (
                <div className="glass mt-3 p-4">
                  <p className="mb-2 text-micro text-ink-4">{c.example}</p>
                  <PayoffChart
                    params={{
                      collateral: 1000,
                      notional: 2000,
                      entry: 1,
                      cap: FIRST_TRANCHE.capPct,
                      barrier: FIRST_TRANCHE.barrierPct,
                    }}
                    capPct={FIRST_TRANCHE.capPct}
                    barrierPct={FIRST_TRANCHE.barrierPct}
                    dailyPremium={4}
                  />
                </div>
              )}
            </div>
          </section>
        ))}

        <div className="border-t border-line py-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 btn-primary px-4 py-2.5 text-xs"
          >
            {c.cta} <ArrowRight size={13} />
          </Link>
        </div>
      </article>
    </div>
  )
}
