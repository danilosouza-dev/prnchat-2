import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[var(--bg-secondary)] group-[.toaster]:text-white group-[.toaster]:border-[var(--border-color)] group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-[var(--text-secondary)]",
          actionButton:
            "group-[.toast]:bg-[var(--accent-pink)] group-[.toast]:text-white",
          cancelButton:
            "group-[.toast]:bg-[var(--bg-tertiary)] group-[.toast]:text-[var(--text-secondary)]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
