import { useCountAnimation } from "@/hooks/use-count-animation";
import { LucideIcon, LucideProps } from "lucide-react"; // Import icon types

interface AnimatedStatProps {
  value: number;
  label: string;
  icon: LucideIcon; // LucideIcon type directly matches lucide-react icons
  iconColor: string;
  valueColor: string;
}

export function AnimatedStat({
  value,
  label,
  icon: Icon,
  iconColor,
  valueColor,
}: AnimatedStatProps) {
  const animatedValue = useCountAnimation(value);

  return (
    <div className="bg-[#111111] border border-purple-900/20 rounded-lg p-4 flex items-center justify-between">
      <div className="flex flex-col">
        <span className={`text-lg sm:text-2xl font-bold ${valueColor}`}>
          {animatedValue.toLocaleString()}
        </span>
        <span className="text-[10px] sm:text-xs text-gray-500">{label}</span>
      </div>
      <Icon className={`h-5 w-5 ${iconColor}`} />
    </div>
  );
}
