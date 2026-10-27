// Public policy pages: Terms, Privacy, Refunds and Disclaimer.
// Each page: { title: [en, ur], intro: [en, ur], sections: [{ h: [en, ur], p: [en, ur] }] }.
// Plain words, no em or en dashes. Keep LEGAL_UPDATED current when a page changes.

export const LEGAL_UPDATED = '15 October 2026';

export const LEGAL = {
  terms: {
    title: ['Terms of use', 'Istemal ki sharait'],
    intro: [
      'These terms apply to everyone who uses JGasFlow: the website, the web app and the mobile app. By creating an account you agree to them.',
      'Yeh sharait JGasFlow istemal karne wale har shakhs par lagoo hain: website, web app aur mobile app. Account banane ka matlab hai ke aap in se mutfiq hain.',
    ],
    sections: [
      {
        h: ['The service', 'Service'],
        p: [
          'JGasFlow is software for LPG cylinder shops to record sales, udhaar, cylinders, purchases, prices and staff. Jantrah Tech runs the service and keeps improving it.',
          'JGasFlow LPG cylinder shops ke liye software hai jis mein sale, udhaar, cylinder, khareedari, qeematein aur staff ka record rakha jata hai. Yeh service Jantrah Tech chalata hai aur isay behtar karta rehta hai.',
        ],
      },
      {
        h: ['Your account', 'Aap ka account'],
        p: [
          'You are responsible for your shop account, your staff logins and what is recorded with them. Keep passwords private. Tell us at once if you think someone else used your account.',
          'Apne shop account, staff logins aur un se kiye gaye record ki zimmedari aap ki hai. Password kisi ko na batayein. Agar lage ke kisi aur ne aap ka account istemal kiya hai to foran humein batayein.',
        ],
      },
      {
        h: ['Free trial and plans', 'Free trial aur plans'],
        p: [
          'New shops get a free trial. After it, a paid plan is needed to keep adding records. Plans are paid monthly or for several months by bank transfer, with a screenshot of the transfer as proof, and start after we confirm the payment.',
          'Nayi dukaan ko free trial milta hai. Us ke baad naye record ke liye paid plan zaroori hai. Plan ki adaigi bank transfer se mahana ya kai mahinon ki hoti hai, transfer ke screenshot ke sath, aur payment confirm hone par plan shuru hota hai.',
        ],
      },
      {
        h: ['When a plan ends', 'Jab plan khatam ho'],
        p: [
          'If a plan ends, your data is kept. You can still open and export it, but you cannot add new sales until you renew.',
          'Plan khatam hone par aap ka data mehfooz rehta hai. Aap isay dekh aur export kar sakte hain, lekin renew kiye baghair nayi sale nahin kar sakte.',
        ],
      },
      {
        h: ['Fair use', 'Sahi istemal'],
        p: [
          'Do not misuse the service: no illegal business records, no attempts to break into other accounts, and no automated attacks. We may suspend accounts that do this.',
          'Service ka ghalat istemal na karein: ghair qanooni karobar ka record, doosre accounts mein ghusne ki koshish ya automated hamle mana hain. Aisa karne wale account band kiye ja sakte hain.',
        ],
      },
      {
        h: ['Changes', 'Tabdeeliyan'],
        p: [
          'We may update these terms. Important changes are shown in the app before they apply.',
          'Hum yeh sharait update kar sakte hain. Ahem tabdeeli lagoo hone se pehle app mein dikhai jati hai.',
        ],
      },
    ],
  },

  privacy: {
    title: ['Privacy policy', 'Privacy policy'],
    intro: [
      'Your shop data belongs to you. This page explains what we keep and why.',
      'Aap ki dukaan ka data aap ka hai. Is safhe par likha hai ke hum kya rakhte hain aur kyun.',
    ],
    sections: [
      {
        h: ['What we keep', 'Hum kya rakhte hain'],
        p: [
          'Your shop name, owner name, phone and email, your staff logins, and the business records you enter: customers, sales, payments, cylinders, purchases and prices. We also keep which devices are signed in, to protect your account.',
          'Dukaan ka naam, malik ka naam, phone aur email, staff logins, aur jo karobari record aap darj karte hain: gahak, sale, wasooli, cylinder, khareedari aur qeematein. Account ki hifazat ke liye yeh bhi rakha jata hai ke kaun se device sign in hain.',
        ],
      },
      {
        h: ['How we use it', 'Hum isay kaise istemal karte hain'],
        p: [
          'Only to run the service for you: show your records, sync your phones, send receipts you print or share, and give support when you ask.',
          'Sirf aap ke liye service chalane ke liye: record dikhana, phones sync karna, jo receipt aap print ya share karein, aur madad mangne par support dena.',
        ],
      },
      {
        h: ['Who can see it', 'Kaun dekh sakta hai'],
        p: [
          'You and the staff you add. Our support team can open your shop only to help you, and every such visit is written in your shop history. We do not sell or share your data.',
          'Aap aur woh staff jo aap shamil karein. Hamari support team sirf madad ke liye aap ki dukaan khol sakti hai, aur har aisi visit aap ki history mein likhi jati hai. Hum aap ka data na bechte hain na kisi ko dete hain.',
        ],
      },
      {
        h: ['Phone app and offline mode', 'Phone app aur offline mode'],
        p: [
          'In offline mode, data stays only on your phone. In online mode, it is kept on our server so the web app and other phones can use it.',
          'Offline mode mein data sirf aap ke phone par rehta hai. Online mode mein yeh hamare server par rakha jata hai taake web app aur doosre phones istemal kar saken.',
        ],
      },
      {
        h: ['Deleting your data', 'Data mitana'],
        p: [
          'You can export your data at any time. To delete your account, open My account on the website or Settings, Account and plan in the app, and click Delete account. A shop owner deletes the shop and all its records at once; staff delete only their own login. We keep only the amount and date of plan payments, for our accounts. Full steps: lite.jgasflow.com/delete-account.',
          'Aap kisi bhi waqt apna data export kar sakte hain. Account delete karne ke liye website par My account ya app mein Settings, Account and plan khol kar Delete account dabayein. Dukaan ka malik dukaan aur sara record foran delete karta hai; staff sirf apna login. Hum sirf plan payment ki raqam aur tareekh hisab ke liye rakhte hain. Poora tareeqa: lite.jgasflow.com/delete-account.',
        ],
      },
      {
        h: ['Keeping it safe', 'Hifazat'],
        p: [
          'Data travels over an encrypted connection (HTTPS). Passwords are stored only as a one-way hash. The app has no ads and no tracking, and does not use your location, contacts, camera or microphone.',
          'Data encrypted connection (HTTPS) par jata hai. Password sirf one-way hash ki shakal mein rakha jata hai. App mein na ads hain na tracking, aur yeh aap ki location, contacts, camera ya microphone istemal nahi karti.',
        ],
      },
    ],
  },

  refund: {
    title: ['Refund policy', 'Refund policy'],
    intro: [
      'You can try JGasFlow free before you pay, so most shops know if it suits them before buying a plan.',
      'Adaigi se pehle JGasFlow free istemal kiya ja sakta hai, is liye aksar dukaanein plan lene se pehle jaan leti hain ke yeh un ke liye theek hai.',
    ],
    sections: [
      {
        h: ['Wrong or double payments', 'Ghalat ya do dafa payment'],
        p: [
          'If you paid twice, or paid the wrong amount, contact support within 7 days with the transaction ID. We return the extra amount or add it to your plan.',
          'Agar do dafa ya ghalat raqam bheji gayi ho to 7 din ke andar transaction ID ke sath support se rabta karein. Zyada raqam wapas ki jayegi ya plan mein jama ho jayegi.',
        ],
      },
      {
        h: ['Plans already started', 'Shuru ho chuke plans'],
        p: [
          'A plan that has started is not refunded for the part already used. For a plan of several months, the unused full months can be refunded within the first 14 days.',
          'Shuru ho chuke plan ke istemal shuda hisse ka refund nahin hota. Kai mahinon ke plan mein pehle 14 din ke andar baqi pure mahinon ka refund ho sakta hai.',
        ],
      },
      {
        h: ['Rejected payments', 'Rad ki gayi payment'],
        p: [
          'If we cannot find your payment, the request is rejected with a reason and no plan is charged. Send it again with the correct transaction ID.',
          'Agar payment na mile to request wajah ke sath rad hoti hai aur koi plan nahin lagta. Sahi transaction ID ke sath dobara bhejein.',
        ],
      },
    ],
  },

  disclaimer: {
    title: ['Disclaimer', 'Disclaimer'],
    intro: [
      'JGasFlow helps you keep records. It does not replace your own checks.',
      'JGasFlow record rakhne mein madad karta hai. Yeh aap ki apni jaanch ki jagah nahin leta.',
    ],
    sections: [
      {
        h: ['Your figures', 'Aap ke hisaab'],
        p: [
          'Totals, udhaar and stock are worked out from what you and your staff enter. Check them against your cash and cylinders regularly.',
          'Total, udhaar aur stock aap aur staff ke darj kiye record se bante hain. Inhein waqtan fawaqtan apni naqdi aur cylinders se mila lein.',
        ],
      },
      {
        h: ['Tax and legal', 'Tax aur qanooni'],
        p: [
          'Receipts and reports are business records, not tax or legal advice. Follow OGRA rules and local laws for prices, safety and filling.',
          'Receipt aur report karobari record hain, tax ya qanooni mashwara nahin. Qeemat, hifazat aur filling ke liye OGRA ke qawaid aur maqami qanoon par amal karein.',
        ],
      },
      {
        h: ['Service availability', 'Service ki dastyabi'],
        p: [
          'We work to keep the service running at all times, but the internet or our server can sometimes be down. The phone app keeps working offline and syncs when the connection is back.',
          'Hum service hamesha chalane ki koshish karte hain, lekin kabhi internet ya server band ho sakta hai. Phone app offline chalti rehti hai aur connection wapas aane par sync kar leti hai.',
        ],
      },
    ],
  },
};
