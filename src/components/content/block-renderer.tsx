import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

import type { ContentBlock } from '@/modules/content/domain/blocks'

/**
 * Renders the CMS block union — task 8.3. **No `dangerouslySetInnerHTML` anywhere in
 * this file, ever**: every string passes through React's escaping, which is the whole
 * security argument of the structured-block design (a unit test scans this file for the
 * attribute, so the property is enforced, not remembered).
 */
export function BlockRenderer({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="flex max-w-content flex-col gap-md">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading':
            return block.level === 2 ? (
              <h2 key={index} className="font-heading text-headline-md">
                {block.text}
              </h2>
            ) : (
              <h3 key={index} className="font-heading text-title-md">
                {block.text}
              </h3>
            )
          case 'paragraph':
            return (
              <p key={index} className="whitespace-pre-wrap text-body-md">
                {block.text}
              </p>
            )
          case 'list':
            return (
              <ul key={index} className="list-disc pl-md text-body-md">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ul>
            )
          case 'image':
            // CMS images are admin-supplied https URLs; next/image would demand a
            // remotePatterns entry per host, which the CMS cannot know in advance.
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={index}
                src={block.url}
                alt={block.alt}
                loading="lazy"
                className="max-w-full rounded-md"
              />
            )
          case 'cta':
            return (
              <div key={index}>
                <Button asChild variant="confirm" size="touch">
                  <Link href={block.href}>{block.label}</Link>
                </Button>
              </div>
            )
        }
      })}
    </div>
  )
}
