import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Command } from 'cmdk'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ComboboxOption {
  value: string
  label: string
}

interface ComboboxProps {
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  id?: string
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Selecione',
  searchPlaceholder = 'Buscar...',
  emptyText = 'Nada encontrado.',
  id,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find(o => o.value === value)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-md',
            'bg-input border border-border text-sm transition',
            'focus:outline-none focus:ring-2 focus:ring-ring',
            selected ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown size={16} className="text-muted-foreground flex-shrink-0" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] bg-popover border border-border rounded-md shadow-xl overflow-hidden"
        >
          <Command className="w-full">
            <div className="flex items-center gap-2 px-3 border-b border-border">
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              <Command.Input
                placeholder={searchPlaceholder}
                className="w-full py-2.5 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            <Command.List className="max-h-60 overflow-y-auto p-1">
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                {emptyText}
              </Command.Empty>
              {options.map(o => (
                <Command.Item
                  key={o.value}
                  value={o.label}
                  onSelect={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                  className="flex items-center gap-2 px-2 py-2 rounded text-sm text-foreground cursor-pointer data-[selected=true]:bg-secondary"
                >
                  <Check size={14} className={cn('flex-shrink-0', value === o.value ? 'opacity-100 text-primary' : 'opacity-0')} />
                  <span className="truncate">{o.label}</span>
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
