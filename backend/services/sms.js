// Stub for Africa's Talking SMS integration.
// https://developers.africastalking.com/docs/sms/overview
// Replace with the real SDK call once AT_USERNAME / AT_API_KEY are set.

async function sendSms(to, message) {
  console.log(`[sms:mock] -> ${to}: ${message}`);
  return { status: "Success", recipient: to };
}

function notifyBottleSealed(bottle) {
  return sendSms(
    bottle.recipient_phone,
    `${bottle.sender_name} has left you something on Sats in a Bottle. ` +
    `It opens on ${bottle.unlock_date}. You'll be notified when it's ready.`
  );
}

function notifyBottleOpened(bottle) {
  return sendSms(
    bottle.recipient_phone,
    `Your bottle from ${bottle.sender_name} just opened! ` +
    `Tap the link to hear your message and claim your Bitcoin: ` +
    `https://satsinabottle.app/unlock?id=${bottle.id}`
  );
}

module.exports = { sendSms, notifyBottleSealed, notifyBottleOpened };
