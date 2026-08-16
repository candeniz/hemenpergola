'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Toaster } from '@/components/ui/toast'
import { toast } from 'sonner'

import { OVERLAYS, type OverlayName } from './page'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-sm border-b border-divider pb-lg">
      <h2 className="font-heading text-headline-md">{title}</h2>
      <div className="flex flex-wrap items-end gap-md">{children}</div>
    </section>
  )
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-xs">
      <code className="text-label-md uppercase text-muted">{label}</code>
      {children}
    </div>
  )
}

/**
 * Every primitive, every variant, every state. A restyle that is never rendered cannot be
 * verified, and from Phase 1 onward this page is the regression surface for the theme.
 */
export function UiGallery({ openOverlay = null }: { openOverlay?: OverlayName | null }) {
  const common = useTranslations('common')
  const [checked, setChecked] = useState(true)
  const [switched, setSwitched] = useState(true)

  /*
   * Overlays render **open** when `?overlay=…` names them.
   *
   * A gallery that renders only the trigger verifies the trigger. `ui/dialog.tsx` carried
   * `max-w-lg` from Phase 0 — which resolves to this theme's *spacing* token, 48 pixels —
   * so every dialog in the application was a 48-pixel column, and this page showed a
   * perfectly good button that opened it. Nothing caught it until an end-to-end test
   * measured a heading's bounding box.
   *
   * One at a time: two open scrims stack, and axe on a page with two modals reports the
   * stacking rather than the components.
   */
  const isOpen = (name: OverlayName) => openOverlay === name

  useEffect(() => {
    if (openOverlay !== 'toast') return
    // Sonner renders nothing until something is dispatched, so an "open" toast has to be
    // fired rather than declared.
    toast('Teklif gönderildi', { description: 'Üretici 48 saat içinde yanıtlayacak.' })
  }, [openOverlay])

  return (
    <div className="flex flex-col gap-lg">
      <Section title="Button">
        <Item label="primary">
          <Button variant="primary">Primary</Button>
        </Item>
        <Item label="confirm">
          <Button variant="confirm">Confirm</Button>
        </Item>
        <Item label="outline">
          <Button variant="outline">Outline</Button>
        </Item>
        <Item label="destructive">
          <Button variant="destructive">Destructive</Button>
        </Item>
        <Item label="ghost">
          <Button variant="ghost">Ghost</Button>
        </Item>
        <Item label="link">
          <Button variant="link">Link</Button>
        </Item>
        <Item label="disabled">
          <Button disabled>Disabled</Button>
        </Item>
        <Item label="with icon">
          <Button variant="confirm">
            Get Offers
            <Icon name="arrow_forward" dense />
          </Button>
        </Item>
        <Item label="size: dense 36px">
          <Button size="dense">Dense</Button>
        </Item>
        <Item label="size: touch 44px">
          <Button size="touch">Touch</Button>
        </Item>
        <Item label="size: icon">
          <Button size="icon" aria-label={common('search')}>
            <Icon name="search" />
          </Button>
        </Item>
      </Section>

      <Section title="Badge">
        <Item label="new">
          <Badge tone="new">New</Badge>
        </Item>
        <Item label="progress">
          <Badge tone="progress">Offer Sent</Badge>
        </Item>
        <Item label="waiting">
          <Badge tone="waiting">Awaiting Survey</Badge>
        </Item>
        <Item label="neutral">
          <Badge tone="neutral">Expired</Badge>
        </Item>
        <Item label="cancelled">
          <Badge tone="cancelled">Cancelled</Badge>
        </Item>
      </Section>

      <Section title="Input · Textarea · Label">
        <Item label="input">
          <span className="flex w-64 flex-col gap-xs">
            <Label htmlFor="g-input">Width (mm)</Label>
            <Input id="g-input" placeholder="5000" />
          </span>
        </Item>
        <Item label="input: invalid">
          <Input
            aria-invalid
            aria-label="Invalid example"
            defaultValue="not-a-number"
            className="w-64"
          />
        </Item>
        <Item label="input: disabled">
          <Input disabled aria-label="Disabled example" placeholder="Disabled" className="w-64" />
        </Item>
        <Item label="textarea">
          <Textarea aria-label="Notes" placeholder="Notes" className="w-64" />
        </Item>
      </Section>

      <Section title="Checkbox · Radio · Switch">
        <Item label="checkbox">
          <span className="flex items-center gap-base">
            <Checkbox
              id="g-check"
              checked={checked}
              onCheckedChange={(v) => setChecked(v === true)}
            />
            <Label htmlFor="g-check">Consent</Label>
          </span>
        </Item>
        <Item label="checkbox: disabled">
          <Checkbox disabled aria-label="Disabled checkbox" />
        </Item>
        <Item label="radio">
          <RadioGroup defaultValue="a">
            <span className="flex items-center gap-base">
              <RadioGroupItem value="a" id="g-r-a" />
              <Label htmlFor="g-r-a">Free-standing</Label>
            </span>
            <span className="flex items-center gap-base">
              <RadioGroupItem value="b" id="g-r-b" />
              <Label htmlFor="g-r-b">Wall-mounted</Label>
            </span>
          </RadioGroup>
        </Item>
        <Item label="switch">
          <Switch checked={switched} onCheckedChange={setSwitched} aria-label="Notifications" />
        </Item>
      </Section>

      <Section title="Overlays, open">
        {/*
         * Links rather than buttons: the state lives in the URL so a11y can visit each one
         * directly, and so a developer can bookmark the broken one.
         */}
        {OVERLAYS.map((name) => (
          <Item key={name} label={name}>
            <Button asChild variant={openOverlay === name ? 'primary' : 'outline'} size="dense">
              <a href={`?overlay=${name}`}>{name}</a>
            </Button>
          </Item>
        ))}
        <Item label="closed">
          <Button asChild variant="ghost" size="dense">
            <a href="?">{common('close')}</a>
          </Button>
        </Item>

        <Dialog open={isOpen('dialog')}>
          <DialogContent closeLabel={common('close')}>
            <DialogHeader>
              <DialogTitle>Send request</DialogTitle>
              <DialogDescription>
                Contact details are shared only after the manufacturer accepts.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost">{common('cancel')}</Button>
              <Button variant="confirm">{common('save')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Sheet open={isOpen('sheet')}>
          <SheetContent side="left" closeLabel={common('close')}>
            <SheetTitle>Filters</SheetTitle>
          </SheetContent>
        </Sheet>

        <DropdownMenu open={isOpen('dropdown')}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="dense">
              Actions
              <Icon name="expand_more" dense />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Request</DropdownMenuLabel>
            <DropdownMenuItem>Accept</DropdownMenuItem>
            <DropdownMenuItem>Decline</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <TooltipProvider>
          <Tooltip open={isOpen('tooltip')}>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="info">
                <Icon name="info" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Estimated, excl. KDV</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Select open={isOpen('select')}>
          <SelectTrigger aria-label="City open" className="w-64">
            <SelectValue placeholder="Choose a city" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="34">İstanbul</SelectItem>
            <SelectItem value="06">Ankara</SelectItem>
            <SelectItem value="35">İzmir</SelectItem>
          </SelectContent>
        </Select>
      </Section>

      <Section title="Select · Dropdown · Tooltip">
        <Item label="select">
          <Select>
            <SelectTrigger aria-label="City" className="w-64">
              <SelectValue placeholder="Choose a city" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="34">İstanbul</SelectItem>
              <SelectItem value="06">Ankara</SelectItem>
              <SelectItem value="35">İzmir</SelectItem>
            </SelectContent>
          </Select>
        </Item>
        <Item label="dropdown">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                Actions
                <Icon name="expand_more" dense />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Request</DropdownMenuLabel>
              <DropdownMenuItem>Accept</DropdownMenuItem>
              <DropdownMenuItem>Decline</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Archive</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Item>
        <Item label="tooltip">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="info">
                  <Icon name="info" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Estimated, excl. KDV</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Item>
      </Section>

      <Section title="Dialog · Sheet · Toast">
        <Item label="dialog">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open dialog</Button>
            </DialogTrigger>
            <DialogContent closeLabel={common('close')}>
              <DialogHeader>
                <DialogTitle>Send request</DialogTitle>
                <DialogDescription>
                  Contact details are shared only after the manufacturer accepts.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost">{common('cancel')}</Button>
                <Button variant="confirm">{common('save')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Item>
        <Item label="sheet">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">Open sheet</Button>
            </SheetTrigger>
            <SheetContent side="left" closeLabel={common('close')}>
              <SheetTitle>Filters</SheetTitle>
            </SheetContent>
          </Sheet>
        </Item>
        <Item label="toaster mounted">
          <Toaster />
        </Item>
      </Section>

      <Section title="Card">
        <Item label="comfortable">
          <Card className="w-72">
            <CardHeader>
              <CardTitle>Bioclimatic Pergola</CardTitle>
              <CardDescription>5000 × 4000 mm · 20 m²</CardDescription>
            </CardHeader>
            <CardContent>Estimated 180.000 – 220.000 ₺</CardContent>
            <CardFooter>
              <Button size="dense" variant="outline">
                Compare
              </Button>
            </CardFooter>
          </Card>
        </Item>
        <Item label="dense">
          <Card density="dense" className="w-72">
            <CardTitle>Request AOE-99421</CardTitle>
            <CardDescription>İstanbul · Kadıköy</CardDescription>
          </Card>
        </Item>
      </Section>

      <Section title="Table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Request</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>AOE-99421</TableCell>
              <TableCell>İstanbul</TableCell>
              <TableCell>
                <Badge tone="new">New</Badge>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>AOE-99422</TableCell>
              <TableCell>Ankara</TableCell>
              <TableCell>
                <Badge tone="waiting">Awaiting Survey</Badge>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>AOE-99423</TableCell>
              <TableCell>İzmir</TableCell>
              <TableCell>
                <Badge tone="neutral">Expired</Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      <Section title="Tabs · Pagination · Progress · Skeleton · Separator · Avatar">
        <Item label="tabs">
          <Tabs defaultValue="one" className="w-72">
            <TabsList>
              <TabsTrigger value="one">Open</TabsTrigger>
              <TabsTrigger value="two">Closed</TabsTrigger>
            </TabsList>
            <TabsContent value="one">Open requests</TabsContent>
            <TabsContent value="two">Closed requests</TabsContent>
          </Tabs>
        </Item>
        <Item label="pagination">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious href="#" label="previous" />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#" isActive>
                  1
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#">2</PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext href="#" label="next" />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </Item>
        <Item label="progress">
          <Progress value={60} label="Upload progress" className="w-64" />
        </Item>
        <Item label="skeleton">
          <span className="flex w-64 flex-col gap-base">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-2/3" />
          </span>
        </Item>
        <Item label="separator">
          <Separator className="w-64" />
        </Item>
        <Item label="avatar">
          <Avatar>
            <AvatarFallback>AY</AvatarFallback>
          </Avatar>
        </Item>
      </Section>

      <Section title="Calendar">
        <Calendar mode="single" />
      </Section>
    </div>
  )
}
