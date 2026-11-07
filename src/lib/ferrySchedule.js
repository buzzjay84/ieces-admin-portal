// Ferry trips drawn on the login screen sea. The panel is read as the Basilan
// Strait: Isabela City on the left, Zamboanga City on the right. A ferry only
// appears while a scheduled trip is under way, sailing toward its destination.
//
// Source: FastCat routes & schedules (https://fastcat.ph/routes-schedules/),
// checked 2026-10-16. Operators change schedules, so update this list when
// they do. Times are local (Asia/Manila); "minutes" is the crossing time.

export const FERRY_TRIPS = [
  { operator: "FastCat", from: "Zamboanga", to: "Isabela", depart: "06:00", minutes: 90 },
  { operator: "FastCat", from: "Isabela", to: "Zamboanga", depart: "08:30", minutes: 90 },
  { operator: "FastCat", from: "Zamboanga", to: "Isabela", depart: "10:00", minutes: 90 },
  { operator: "FastCat", from: "Isabela", to: "Zamboanga", depart: "13:00", minutes: 90 },
  { operator: "FastCat", from: "Zamboanga", to: "Isabela", depart: "15:00", minutes: 90 },
  { operator: "FastCat", from: "Isabela", to: "Zamboanga", depart: "17:30", minutes: 90 },
];

const toMinutes = (hhmm) => {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
};

// Trips under way at `date`, with progress from 0 (departed) to 1 (arrived).
export function getActiveFerries(date = new Date()) {
  const now = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  return FERRY_TRIPS.flatMap((trip) => {
    const start = toMinutes(trip.depart);
    const progress = (now - start) / trip.minutes;
    if (progress < 0 || progress > 1) return [];
    return [
      {
        key: `${trip.operator}-${trip.from}-${trip.depart}`,
        trip,
        progress,
        outbound: trip.from === "Isabela",
      },
    ];
  });
}
