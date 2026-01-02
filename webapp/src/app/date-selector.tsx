"use client";

import { useRouter } from "next/navigation";

interface DateSelectorProps {
  dates: string[];
  selectedDate: string;
}

export function DateSelector({ dates, selectedDate }: DateSelectorProps) {
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    router.push(`?date=${e.target.value}`);
  };

  return (
    <div className="flex items-center gap-3">
      <label htmlFor="date" className="text-sm font-medium text-gray-600">
        Date
      </label>
      <select
        id="date"
        name="date"
        value={selectedDate}
        onChange={handleChange}
        className="px-4 py-2 text-sm bg-white border border-gray-200 rounded-lg shadow-sm
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   cursor-pointer hover:border-gray-300 transition-colors"
      >
        {dates.map((date) => (
          <option key={date} value={date}>
            {date}
          </option>
        ))}
      </select>
    </div>
  );
}
