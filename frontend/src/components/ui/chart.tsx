import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";

export function Chart({
  data
}: {
  data: any[];
}) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="value"
          strokeWidth={2}
          activeDot={{
            r: 8,
          }}
        />
        <Tooltip />
      </LineChart>
    </ResponsiveContainer>
  );
}