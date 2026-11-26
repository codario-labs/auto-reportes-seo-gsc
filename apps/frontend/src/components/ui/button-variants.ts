import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 focus-visible:ring-offset-1',
  {
    variants: {
      variant: {
        default: 'bg-ink text-white hover:bg-ink/88 active:bg-ink/80',
        secondary: 'border border-line bg-surface text-ink hover:bg-subtle hover:border-line-strong',
        ghost: 'text-ink-2 hover:bg-ink/[0.05] hover:text-ink',
        destructive: 'bg-danger text-white hover:bg-danger/90',
        'destructive-ghost': 'text-danger hover:bg-danger-soft',
        link: 'h-auto px-0 text-ink underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-ui',
        default: 'h-9 px-3.5',
        lg: 'h-10 px-5',
        icon: 'size-9',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);
