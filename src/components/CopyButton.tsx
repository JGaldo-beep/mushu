import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { tauri } from "@/lib/tauri";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "ghost" | "secondary";

export function CopyButton({
  text,
  variant = "default",
  size = "sm",
  label = "Copiar",
  copiedLabel = "Copiado",
  className,
}: {
  text: string;
  variant?: Variant;
  size?: "sm" | "default" | "icon";
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await tauri.copyToClipboard(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={onCopy}
      className={cn("gap-1.5", className)}
      aria-live="polite"
    >
      {copied ? (
        <>
          <Check className="size-3.5" strokeWidth={2.5} />
          <span>{copiedLabel}</span>
        </>
      ) : (
        <>
          <Copy className="size-3.5" strokeWidth={2.25} />
          <span>{label}</span>
        </>
      )}
    </Button>
  );
}
