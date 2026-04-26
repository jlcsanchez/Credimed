/* =========================================================================
   Credimed backend.js
   Shared module for Cognito auth + Stripe payments + API calls.
   Extracted from the production monolith (commit e9a9bda).

   Usage:
     <script src="https://cdn.jsdelivr.net/npm/amazon-cognito-identity-js@6.3.12/dist/amazon-cognito-identity.min.js"></script>
     <script src="backend.js"></script>

   Exposes (window-level):
     CREDIMED_COGNITO   config object
     CREDIMED_API       API Gateway base URL
     CREDIMED_LAMBDA    direct Lambda URL (payments)
     CREDIMED_STRIPE_PK Stripe publishable key

     authFetch(url, opts)                    JWT-aware fetch wrapper
     cognitoSignUp(email, pw, first, last)   signup
     cognitoConfirmSignUp(email, code)       confirm with email code
     cognitoResendCode(email)                resend confirmation
     cognitoSignIn(email, pw)                login
     cognitoGetIdToken()                     current JWT (auto-refresh)
     cognitoGetCurrentUser()                 user attrs + sub
     cognitoSignOut()                        logout

     loadStripe()                            returns Promise<Stripe>
     createPaymentIntent({ plan, amount, email, claimId })
     mountStripePaymentElement(clientSecret, containerId)
     confirmStripePayment(returnUrl)
   ========================================================================= */

/* ---------- Config ---------- */
window.CREDIMED_COGNITO = {
  UserPoolId: 'us-west-2_8GgqReC58',
  ClientId:   '24u3395do8jtqo4joj6jlh62if',
  Region:     'us-west-2'
};
window.CREDIMED_API    = 'https://0xosu4ifj5.execute-api.us-west-2.amazonaws.com';
window.CREDIMED_LAMBDA = 'https://vhimqtp4oxicnyv6yarj2kpipe0sjfto.lambda-url.us-west-2.on.aws/';
window.CREDIMED_STRIPE_PK = 'pk_test_51TKrV9EqFJnMc0RQN8UzTVtOgSJw7VoJ9uCoxLWYWYQYUUy3JzWatcXiw4EJV6wMRDcfc5urKPTq92DgCdhlDpMk00n3Y3HFsv';

/* ---------- authFetch: JWT-aware fetch wrapper ---------- */
window.authFetch = async function (url, opts) {
  opts = opts || {};
  opts.headers = opts.headers || {};

  var token = null;
  try { token = await window.cognitoGetIdToken(); } catch (e) { /* not logged in */ }

  if (token) opts.headers['Authorization'] = 'Bearer ' + token;

  if (opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) {
    opts.body = JSON.stringify(opts.body);
    opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
  }

  var resp = await fetch(url, opts);

  if (resp.status === 401) {
    console.warn('[authFetch] 401 - session expired, redirecting to login');
    try { window.cognitoSignOut(); } catch (e) {}
    // Preserve where the user was so login can redirect back. Skip
    // for the login page itself to avoid a redirect loop.
    var here = window.location.pathname + window.location.search + window.location.hash;
    var loginUrl = '/app/login.html?reason=expired';
    if (!/\/login\.html$/.test(window.location.pathname)) {
      loginUrl += '&return=' + encodeURIComponent(here);
    }
    try { window.location.href = loginUrl; } catch (e) {}
    throw new Error('Session expired. Please sign in again.');
  }
  return resp;
};

/* ---------- Cognito helpers ---------- */
(function () {
  var AmazonCognitoIdentity = window.AmazonCognitoIdentity;
  if (!AmazonCognitoIdentity) {
    console.error('[Cognito] SDK not loaded. Add <script src="https://cdn.jsdelivr.net/npm/amazon-cognito-identity-js@6.3.12/dist/amazon-cognito-identity.min.js"></script> BEFORE backend.js.');
    return;
  }

  var pool = new AmazonCognitoIdentity.CognitoUserPool({
    UserPoolId: window.CREDIMED_COGNITO.UserPoolId,
    ClientId:   window.CREDIMED_COGNITO.ClientId
  });
  window._cognitoPool = pool;

  window.cognitoSignUp = function (email, password, firstName, lastName) {
    return new Promise(function (resolve, reject) {
      var attrs = [
        new AmazonCognitoIdentity.CognitoUserAttribute({ Name: 'email',       Value: email }),
        new AmazonCognitoIdentity.CognitoUserAttribute({ Name: 'given_name',  Value: firstName || '' }),
        new AmazonCognitoIdentity.CognitoUserAttribute({ Name: 'family_name', Value: lastName  || '' })
      ];
      pool.signUp(email, password, attrs, null, function (err, result) {
        if (err) return reject(err);
        resolve({ userSub: result.userSub, needsConfirmation: !result.userConfirmed });
      });
    });
  };

  window.cognitoConfirmSignUp = function (email, code) {
    return new Promise(function (resolve, reject) {
      var user = new AmazonCognitoIdentity.CognitoUser({ Username: email, Pool: pool });
      user.confirmRegistration(code, true, function (err, result) {
        if (err) return reject(err);
        resolve(result);
      });
    });
  };

  window.cognitoResendCode = function (email) {
    return new Promise(function (resolve, reject) {
      var user = new AmazonCognitoIdentity.CognitoUser({ Username: email, Pool: pool });
      user.resendConfirmationCode(function (err, result) {
        if (err) return reject(err);
        resolve(result);
      });
    });
  };

  window.cognitoSignIn = function (email, password) {
    return new Promise(function (resolve, reject) {
      var user = new AmazonCognitoIdentity.CognitoUser({ Username: email, Pool: pool });
      var authDetails = new AmazonCognitoIdentity.AuthenticationDetails({
        Username: email, Password: password
      });
      user.authenticateUser(authDetails, {
        onSuccess: function (session) {
          resolve({
            idToken:      session.getIdToken().getJwtToken(),
            accessToken:  session.getAccessToken().getJwtToken(),
            refreshToken: session.getRefreshToken().getToken(),
            user: user
          });
        },
        onFailure: function (err) { reject(err); },
        newPasswordRequired: function () {
          reject(new Error('NEW_PASSWORD_REQUIRED: Contact support.'));
        }
      });
    });
  };

  window.cognitoGetIdToken = function () {
    return new Promise(function (resolve, reject) {
      var user = pool.getCurrentUser();
      if (!user) return reject(new Error('No active session'));
      user.getSession(function (err, session) {
        if (err) return reject(err);
        if (!session.isValid()) return reject(new Error('Session invalid'));
        resolve(session.getIdToken().getJwtToken());
      });
    });
  };

  window.cognitoGetCurrentUser = function () {
    var user = pool.getCurrentUser();
    if (!user) return Promise.resolve(null);
    return new Promise(function (resolve, reject) {
      user.getSession(function (err, session) {
        if (err) return reject(err);
        user.getUserAttributes(function (err2, attrs) {
          if (err2) return reject(err2);
          var a = {};
          attrs.forEach(function (x) { a[x.getName()] = x.getValue(); });
          resolve({ username: user.getUsername(), attributes: a, sub: a.sub });
        });
      });
    });
  };

  window.cognitoSignOut = function () {
    var user = pool.getCurrentUser();
    if (user) user.signOut();
  };

  /* Kick off password reset: emails a code to the user. */
  window.cognitoForgotPassword = function (email) {
    return new Promise(function (resolve, reject) {
      var user = new AmazonCognitoIdentity.CognitoUser({ Username: email, Pool: pool });
      user.forgotPassword({
        onSuccess: function (data) { resolve(data); },
        onFailure: function (err) { reject(err); }
      });
    });
  };

  /* Complete password reset with the emailed code + a new password. */
  window.cognitoConfirmPassword = function (email, code, newPassword) {
    return new Promise(function (resolve, reject) {
      var user = new AmazonCognitoIdentity.CognitoUser({ Username: email, Pool: pool });
      user.confirmPassword(code, newPassword, {
        onSuccess: function (data) { resolve(data); },
        onFailure: function (err) { reject(err); }
      });
    });
  };
})();

/* ---------- Stripe helpers ---------- */
(function () {
  var stripeInstance = null;
  var stripeElements = null;
  var stripePaymentElement = null;

  /* Memoized load. Prior version created a fresh Promise every call, which
     meant a warm-up call (fire-and-forget at script parse time) and the
     real call (inside mountStripePaymentElement) could both race to append
     a <script src="https://js.stripe.com/v3/">, and whichever onload fired
     second would re-initialize stripeInstance. That race added 200-500ms
     of visible pause before the Payment Element appeared. Cache the
     promise on first call so all subsequent calls reuse it. */
  var stripeLoadPromise = null;
  window.loadStripe = function () {
    if (stripeLoadPromise) return stripeLoadPromise;

    stripeLoadPromise = new Promise(function (resolve, reject) {
      if (stripeInstance) return resolve(stripeInstance);

      // The page preloads https://js.stripe.com/v3/ via an <script async> in
      // the <head>. If that has already finished, Stripe is in the global
      // scope — skip the extra fetch entirely.
      if (typeof Stripe !== 'undefined') {
        stripeInstance = Stripe(window.CREDIMED_STRIPE_PK);
        return resolve(stripeInstance);
      }

      // If there's already an async Stripe script in flight (the one in
      // the page's <head>), hook into its load event instead of appending
      // a second copy.
      var existing = document.querySelector('script[src="https://js.stripe.com/v3/"]');
      if (existing) {
        existing.addEventListener('load', function () {
          stripeInstance = Stripe(window.CREDIMED_STRIPE_PK);
          resolve(stripeInstance);
        });
        existing.addEventListener('error', function () { reject(new Error('Failed to load Stripe.js')); });
        // Safety: if by some oddity Stripe already defined itself, fall through
        if (typeof Stripe !== 'undefined') {
          stripeInstance = Stripe(window.CREDIMED_STRIPE_PK);
          resolve(stripeInstance);
        }
        return;
      }

      var s = document.createElement('script');
      s.src = 'https://js.stripe.com/v3/';
      s.async = true;
      s.onload = function () {
        stripeInstance = Stripe(window.CREDIMED_STRIPE_PK);
        resolve(stripeInstance);
      };
      s.onerror = function () { reject(new Error('Failed to load Stripe.js')); };
      document.head.appendChild(s);
    });
    return stripeLoadPromise;
  };

  /* Calls the payment Lambda to create a PaymentIntent.
     Returns { clientSecret }

     Amount is computed from `plan` to match the credimed-payment Lambda's
     PLANS table in AWS, which now uses engine-aligned keys and prices:
       standard: 4900
       plus:     7900
       premium:  9900
     The Lambda is authoritative — these numbers must stay in sync with
     its PLANS const. Whatever opts.amount the caller passes is ignored. */
  window.createPaymentIntent = async function (opts) {
    opts = opts || {};
    var plan = opts.plan || 'standard';
    /* Frontend amount is the FALLBACK only — the Lambda re-derives the
       price from `plan` against its server-side PLANS const before
       creating the PaymentIntent, so a tampered `amount` in this body
       is ignored. We still send a sane number to fail fast in the rare
       case the Lambda is misconfigured. */
    var PLAN_AMOUNTS = { standard: 4900, plus: 7900, premium: 9900 };
    if (!PLAN_AMOUNTS[plan]) {
      throw new Error('Unknown plan: ' + plan);
    }
    var amount = PLAN_AMOUNTS[plan];

    var body = {
      action:   'create_payment_intent',
      plan:     plan,
      amount:   amount,
      currency: opts.currency || 'usd',
      email:    opts.email    || null,
      claimId:  opts.claimId  || null
    };

    /* Attach Cognito ID token so the Lambda can verify identity and tie
       the PaymentIntent to a real user. The Lambda must reject requests
       without a valid token to prevent unauthenticated PaymentIntent
       creation. Failure to obtain a token is non-fatal here — the
       Lambda will return 401 and the UI surfaces that. */
    var headers = { 'Content-Type': 'application/json' };
    try {
      var idToken = await window.cognitoGetIdToken();
      if (idToken) headers['Authorization'] = 'Bearer ' + idToken;
    } catch (e) { /* not signed in — Lambda will reject */ }

    console.log('[createPaymentIntent] sending to Lambda:', body);
    return fetch(window.CREDIMED_LAMBDA, {
      method:  'POST',
      headers: headers,
      body:    JSON.stringify(body)
    }).then(function (r) { return r.json(); })
      .then(function (data) {
        console.log('[createPaymentIntent] Lambda response:', data);
        var cs = data.clientSecret || data.client_secret || data.paymentIntentClientSecret;
        if (!cs) throw new Error('No clientSecret in Lambda response: ' + JSON.stringify(data));
        return { clientSecret: cs };
      });
  };

  /* Mounts a Stripe Payment Element inside the given container id.
     Returns the PaymentElement (for later use). */
  window.mountStripePaymentElement = async function (clientSecret, containerId) {
    var stripe = await window.loadStripe();
    var elements = stripe.elements({
      clientSecret: clientSecret,
      /* loader:'auto' makes Stripe render its own skeleton UI while the
         element iframe loads — so the payment form feels intentional and
         styled rather than empty space with a spinner. */
      loader: 'auto',
      appearance:   { theme: 'stripe', variables: { colorPrimary: '#0D9488' } }
    });
    stripeElements = elements;

    var paymentEl = elements.create('payment', {
      layout:  'tabs',
      wallets: { applePay: 'auto', googlePay: 'auto' }
    });
    paymentEl.mount('#' + containerId);
    stripePaymentElement = paymentEl;
    return paymentEl;
  };

  /* Confirms the mounted payment. Redirects to returnUrl on success. */
  window.confirmStripePayment = async function (returnUrl) {
    if (!stripeElements) throw new Error('Stripe Elements not mounted yet');
    var stripe = await window.loadStripe();
    return stripe.confirmPayment({
      elements: stripeElements,
      confirmParams: { return_url: returnUrl }
    });
  };

  /* Expose for debugging */
  window._stripe = function () { return stripeInstance; };
})();
