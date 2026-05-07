import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GlassSelectOption {
  value: string;
  label: string;
}

interface GlassSelectProps {
  value: string;
  options: GlassSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function GlassSelect({
  value,
  options,
  onChange,
  placeholder,
  disabled,
  className,
}: GlassSelectProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        className={className}
        style={{
          background: "var(--glass-bg)",
          border: "0.5px solid var(--glass-border-outer)",
          color: "var(--text-primary)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          boxShadow: "inset 0 1px 0 var(--glass-border)",
        }}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        style={{
          background: "oklch(15% 0.08 209 / 0.96)",
          border: "0.5px solid var(--glass-border)",
          backdropFilter: "blur(20px) saturate(140%)",
          WebkitBackdropFilter: "blur(20px) saturate(140%)",
          color: "var(--text-primary)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 24px rgba(0,0,0,0.40)",
        }}
      >
        {options.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            style={{ color: "var(--text-primary)" }}
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
