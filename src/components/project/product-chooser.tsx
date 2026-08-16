'use client'

import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { createProjectAction } from '@/app/actions/project'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import type { ConfigurableProduct } from '@/modules/catalog/application/catalog-service'

/**
 * Stage 1 — `10-project-configurator.md` §Step structure steps 1 and 2 (category, product),
 * rendered as one screen because that is what `create_project_wizard_refined_style` shows and
 * what `ADR-013` means by three visible stages.
 *
 * Choosing creates the draft and hands back its id; every later step writes to that row, which
 * is what makes the wizard survive a browser restart (`07` §Forms).
 */
export function ProductChooser({ products }: { products: readonly ConfigurableProduct[] }) {
  const t = useTranslations('wizard')
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  function choose(productId: string) {
    startTransition(async () => {
      const result = (await createProjectAction({ productId })) as
        { data: { projectId: string } } | { error: { message: string } }

      if ('error' in result) {
        setMessage(result.error.message)
        return
      }

      // A full navigation rather than a client-side push: the wizard page loads the draft it
      // is about to edit, and arriving with stale client state is the bug per-step persistence
      // exists to prevent.
      window.location.assign(`/proje/${result.data.projectId}`)
    })
  }

  const byCategory = new Map<string, ConfigurableProduct[]>()
  for (const product of products) {
    byCategory.set(product.categoryName, [...(byCategory.get(product.categoryName) ?? []), product])
  }

  return (
    <div className="flex flex-col gap-sm">
      {message === null ? null : (
        <p role="status" className="text-body-sm text-muted">
          {message}
        </p>
      )}

      {products.length === 0 ? <p className="text-body-md text-muted">{t('noProducts')}</p> : null}

      {[...byCategory.entries()].map(([category, items]) => (
        <section key={category} className="flex flex-col gap-base">
          <h2 className="font-heading text-title-md">{category}</h2>
          <div className="grid gap-base sm:grid-cols-2">
            {items.map((product) => (
              <Card key={product.productId} className="flex flex-col gap-base">
                <CardTitle>{product.name}</CardTitle>
                <CardDescription>{t(`basis.${product.basisType}`)}</CardDescription>
                <Button onClick={() => choose(product.productId)} disabled={pending}>
                  {t('chooseProduct')}
                </Button>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
