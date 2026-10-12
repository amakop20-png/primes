/**
 * hero-anim.js — NuraXQ Interactive Homepage Hero Demonstration Engine
 * 
 * Drives the realistic 7-step virtual number purchase & OTP flow:
 * 1. Open platform
 * 2. Select country & service
 * 3. Click purchase button
 * 4. Realistic number allocated (+1 (202) 555-0184)
 * 5. Waiting for SMS indicator
 * 6. Live OTP verification code arrives (849-201)
 * 7. Subtle success indicator, smooth loop
 */

(function () {
  'use strict';

  function initHeroAnimation() {
    const container = document.getElementById('heroAnimStage');
    if (!container) return;

    // Elements inside stage
    const step1 = document.getElementById('animStep1');
    const step2 = document.getElementById('animStep2');
    const step3 = document.getElementById('animStep3');

    const countryCard = document.getElementById('animCountryCard');
    const serviceCard = document.getElementById('animServiceCard');
    const buyBtn      = document.getElementById('animBuyBtn');
    const cursor      = document.getElementById('animCursor');

    const numberBox   = document.getElementById('animNumberBox');
    const waitingBox  = document.getElementById('animWaitingBox');
    const otpCard     = document.getElementById('animOtpCard');
    const successBox  = document.getElementById('animSuccessBox');

    let isRunning = true;
    let timerId = null;

    function resetStage() {
      if (step1) step1.className = 'anim-step-item active';
      if (step2) step2.className = 'anim-step-item';
      if (step3) step3.className = 'anim-step-item';

      if (countryCard) countryCard.classList.remove('selected');
      if (serviceCard) serviceCard.classList.remove('selected');
      if (buyBtn) {
        buyBtn.classList.remove('clicking');
        buyBtn.innerHTML = '<span>Get Virtual Number</span><i class="ph ph-arrow-right"></i>';
      }

      if (cursor) {
        cursor.style.opacity = '0';
        cursor.style.top = '10%';
        cursor.style.left = '10%';
      }

      if (numberBox)  numberBox.style.display = 'none';
      if (waitingBox) waitingBox.style.display = 'none';
      if (otpCard)    otpCard.style.display = 'none';
      if (successBox) successBox.style.display = 'none';
    }

    function runSequence() {
      resetStage();

      // Step 1: Select Country (0.6s)
      timerId = setTimeout(() => {
        if (!isRunning) return;
        if (cursor) {
          cursor.style.opacity = '1';
          cursor.style.top = '22px';
          cursor.style.left = '24%';
        }
        setTimeout(() => {
          if (countryCard) countryCard.classList.add('selected');
        }, 500);

        // Step 2: Select Service (1.8s)
        timerId = setTimeout(() => {
          if (!isRunning) return;
          if (cursor) {
            cursor.style.top = '22px';
            cursor.style.left = '74%';
          }
          setTimeout(() => {
            if (serviceCard) serviceCard.classList.add('selected');
          }, 500);

          // Step 3: Glide to Buy Button (3.0s)
          timerId = setTimeout(() => {
            if (!isRunning) return;
            if (step1) step1.className = 'anim-step-item';
            if (step2) step2.className = 'anim-step-item active';

            if (cursor) {
              cursor.style.top = '88px';
              cursor.style.left = '50%';
            }

            // Click Buy Button (3.8s)
            timerId = setTimeout(() => {
              if (!isRunning) return;
              if (buyBtn) {
                buyBtn.classList.add('clicking');
                buyBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i><span>Allocating Number...</span>';
              }
              if (cursor) cursor.style.opacity = '0';

              // Step 4: Number Allocated (4.8s)
              timerId = setTimeout(() => {
                if (!isRunning) return;
                if (buyBtn) {
                  buyBtn.classList.remove('clicking');
                  buyBtn.innerHTML = '<i class="ph ph-check-circle"></i><span>Allocated Successfully</span>';
                }
                if (numberBox) numberBox.style.display = 'block';

                // Step 5: Waiting for SMS Radar (6.0s)
                timerId = setTimeout(() => {
                  if (!isRunning) return;
                  if (waitingBox) waitingBox.style.display = 'flex';

                  // Step 6: OTP Arrives (7.8s)
                  timerId = setTimeout(() => {
                    if (!isRunning) return;
                    if (step2) step2.className = 'anim-step-item';
                    if (step3) step3.className = 'anim-step-item active';

                    if (waitingBox) waitingBox.style.display = 'none';
                    if (otpCard) otpCard.style.display = 'block';

                    // Step 7: Verification Success (9.5s)
                    timerId = setTimeout(() => {
                      if (!isRunning) return;
                      if (successBox) successBox.style.display = 'flex';

                      // Pause & Restart Loop (13.5s)
                      timerId = setTimeout(() => {
                        if (isRunning) runSequence();
                      }, 4000);
                    }, 1700);

                  }, 1800);

                }, 1200);

              }, 1000);

            }, 800);

          }, 1200);

        }, 1200);

      }, 600);
    }

    // Start on view
    runSequence();

    // Respect reduced motion
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      isRunning = false;
      resetStage();
      if (countryCard) countryCard.classList.add('selected');
      if (serviceCard) serviceCard.classList.add('selected');
      if (numberBox) numberBox.style.display = 'block';
      if (otpCard) otpCard.style.display = 'block';
      if (successBox) successBox.style.display = 'flex';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeroAnimation);
  } else {
    initHeroAnimation();
  }
})();
