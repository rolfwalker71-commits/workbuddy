import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
process.stdout.write(
  [
    "# Optional override only — WorkBuddy auto-generates keys in the DB if unset.",
    `VAPID_PUBLIC_KEY=${keys.publicKey}`,
    `VAPID_PRIVATE_KEY=${keys.privateKey}`,
    "VAPID_SUBJECT=mailto:you@example.com",
    "",
  ].join("\n")
);
