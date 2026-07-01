import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";

export interface SelectListItem {
  label: string;
  value: string;
  subtitle?: string;
}

export interface SelectListProps {
  items: SelectListItem[];
  onSelect: (value: string) => void;
}

export default function SelectList({
  items,
  onSelect,
}: SelectListProps): React.JSX.Element {
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    setSelected((current) =>
      items.length === 0 ? 0 : Math.min(current, items.length - 1)
    );
  }, [items.length]);

  useInput(
    (input, key) => {
      if (items.length === 0) return;

      if (key.upArrow || input === "k") {
        setSelected((current) => (current - 1 + items.length) % items.length);
      }

      if (key.downArrow || input === "j") {
        setSelected((current) => (current + 1) % items.length);
      }

      if (key.return) {
        onSelect(items[selected].value);
      }
    },
    { isActive: items.length > 0 }
  );

  if (items.length === 0) {
    return <Text dimColor>没有可选项</Text>;
  }

  return (
    <Box flexDirection="column">
      {items.map((item, index) => {
        const active = index === selected;

        return (
          <Box key={item.value} flexDirection="column" marginBottom={1}>
            <Text color={active ? "cyan" : undefined} bold={active}>
              {active ? "●" : "○"} {item.label}
            </Text>
            {item.subtitle ? (
              <Text dimColor>  {item.subtitle}</Text>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
