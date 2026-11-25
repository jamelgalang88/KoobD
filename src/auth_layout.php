<?php
// The sign-in pages (log.php, sign.php, teacher_login.php, teacher_register.php)
// show KoobD's main characters in a carousel beside the login card - the same
// look as choosing a character (reader.php): a tall card in each character's
// colours, the middle one large, its neighbours smaller and faded. It turns by
// itself (css/auth.css, the script below); it is only a showcase. The page
// scrolls when a screen is too short for the carousel and the card.

function koobdAuthCarousel(): void
{
    // The main characters: [profile key (for its colours), picture, name].
    $characters = [
        ['cubebot', 'cubebot', 'CubeBot'],
        ['flower', 'flowergirl', 'FlowerGirl'],
        ['golem', 'golem', 'Mr. Golem'],
        ['twig', 'twigg', 'Twigg'],
        ['watermain', 'water-spirit', 'Water Spirit'],
        ['raincat', 'whitey', 'Whitey'],
    ];
    ?>
    <div class="auth-carousel" data-auth-carousel aria-hidden="true">
      <div class="auth-car-stage">
        <?php foreach ($characters as $index => [$key, $file, $name]): ?>
          <?php $colors = koobdReaderProfileDefaults($key); ?>
          <div class="auth-car-card<?= $index === 0 ? ' is-active' : '' ?>" style="--car-top:<?= htmlspecialchars($colors['top']) ?>; --car-bottom:<?= htmlspecialchars($colors['bottom']) ?>;">
            <div class="auth-car-avatar">
              <img src="<?= htmlspecialchars(koobdAsset('assets/images/showcase/' . $file . '.png')) ?>" alt="" width="140" height="140" decoding="async">
            </div>
          </div>
        <?php endforeach; ?>
      </div>
      <div class="auth-car-dots">
        <?php foreach ($characters as $index => $character): ?>
          <span class="auth-car-dot<?= $index === 0 ? ' is-active' : '' ?>"></span>
        <?php endforeach; ?>
      </div>
    </div>
    <script>
      (() => {
        // Turn the carousel every few seconds (not for readers who prefer less
        // motion, and not while the tab is hidden).
        const root = document.querySelector('[data-auth-carousel]');
        if (!root) return;
        const cards = Array.from(root.querySelectorAll('.auth-car-card'));
        const dots = Array.from(root.querySelectorAll('.auth-car-dot'));
        const places = { '-2': 'is-prev2', '-1': 'is-prev', '0': 'is-active', '1': 'is-next', '2': 'is-next2' };
        let current = 0;
        function show(index) {
          current = (index + cards.length) % cards.length;
          cards.forEach((card, i) => {
            let offset = i - current;
            if (offset > cards.length / 2) offset -= cards.length;
            if (offset < -cards.length / 2) offset += cards.length;
            card.className = 'auth-car-card ' + (places[offset] || 'is-hidden');
          });
          dots.forEach((dot, i) => dot.classList.toggle('is-active', i === current));
        }
        show(0);
        const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!still) {
          window.setInterval(() => { if (!document.hidden) show(current + 1); }, 2600);
        }

      })();
    </script>
    <?php
}

// The login (or register) card, with the Student and Teacher forms both in it:
// the Student / Teacher switch shows one or the other at once, without
// loading another page (the address follows along). Each form still sends to
// its own page - log.php, teacher_login.php, sign.php, teacher_register.php -
// which checks it as before. $error belongs to $active, the role whose page
// this is.
function koobdAuthCard(string $mode, string $active, string $error = ''): void
{
    $register = $mode === 'register';
    $roles = [
        'student' => [
            'page' => $register ? 'sign.php' : 'log.php',
            'other' => $register ? 'log.php' : 'sign.php',
            'title' => $register ? 'Create your account' : 'Student login',
            'browserTitle' => $register ? 'KoobD - Register' : 'KoobD - Login',
            'subtitle' => $register
                ? 'Create your account, then choose the reader profile you want to customize.'
                : 'Pick up your story and jump back into your reading world.',
            'email' => 'Email',
            'switch' => $register ? ['Already registered?', 'Log in'] : ["Don't have an account?", 'Sign up'],
        ],
        'teacher' => [
            'page' => $register ? 'teacher_register.php' : 'teacher_login.php',
            'other' => $register ? 'teacher_login.php' : 'teacher_register.php',
            'title' => $register ? 'Create a teacher account' : 'Teacher login',
            'browserTitle' => $register ? 'KoobD - Teacher Register' : 'KoobD - Teacher Login',
            'subtitle' => $register
                ? 'Create a teacher account, choose your classroom profile, and start building classes for students.'
                : 'Manage your classrooms and see how your students are reading.',
            'email' => 'Teacher email',
            'switch' => $register ? ['Already a teacher?', 'Log in'] : ['Need a teacher account?', 'Register'],
        ],
    ];
    // What was typed comes back after an error (never the password).
    $kept = static fn(string $role, string $name): string => $role === $active ? htmlspecialchars((string)($_POST[$name] ?? '')) : '';
    ?>
        <div class="auth-card<?= $register ? ' auth-card-register' : '' ?>" data-auth-card>
          <div class="auth-role-switch" role="tablist" aria-label="Account type">
            <?php foreach ($roles as $role => $info): ?>
              <button type="button" role="tab" id="authTab-<?= $role ?>" class="auth-role-pill<?= $role === $active ? ' is-active' : '' ?>"
                data-auth-role="<?= $role ?>" data-auth-href="<?= $info['page'] ?>" data-auth-title="<?= htmlspecialchars($info['browserTitle']) ?>"
                aria-controls="authPane-<?= $role ?>" aria-selected="<?= $role === $active ? 'true' : 'false' ?>"><?= $role === 'student' ? 'Student' : 'Teacher' ?></button>
            <?php endforeach; ?>
          </div>

          <img class="auth-logo" src="assets/images/icons/LOGO 1.png" alt="KoobD" width="900" height="506">

          <?php foreach ($roles as $role => $info): ?>
            <div class="auth-pane" id="authPane-<?= $role ?>" role="tabpanel" aria-labelledby="authTab-<?= $role ?>" data-auth-pane="<?= $role ?>"<?= $role === $active ? '' : ' hidden' ?>>
              <h1 class="auth-h1"><?= htmlspecialchars($info['title']) ?></h1>
              <p class="auth-subtitle"><?= htmlspecialchars($info['subtitle']) ?></p>

              <form action="<?= $info['page'] ?>" method="post" class="auth-form" aria-label="<?= htmlspecialchars($info['title']) ?>">
                <?php if ($register && $role === 'student'): ?>
                  <div class="two-cols">
                    <input class="auth-input" type="text" name="firstName" placeholder="First name" aria-label="First name" autocomplete="given-name" value="<?= $kept($role, 'firstName') ?>" required>
                    <input class="auth-input" type="text" name="lastName" placeholder="Last name" aria-label="Last name" autocomplete="family-name" value="<?= $kept($role, 'lastName') ?>" required>
                  </div>
                <?php elseif ($register): ?>
                  <input class="auth-input" type="text" name="teacherName" placeholder="Teacher name" aria-label="Teacher name" autocomplete="name" value="<?= $kept($role, 'teacherName') ?>" required>
                <?php endif; ?>
                <input class="auth-input" type="email" name="email" placeholder="<?= $info['email'] ?>" aria-label="<?= $info['email'] ?>" autocomplete="email" value="<?= $kept($role, 'email') ?>" required>
                <input class="auth-input" type="password" name="password" placeholder="Password" aria-label="Password" autocomplete="<?= $register ? 'new-password' : 'current-password' ?>" required>
                <?php if ($register): ?>
                  <input class="auth-input" type="password" name="confirmPassword" placeholder="Confirm password" aria-label="Confirm password" autocomplete="new-password" required>
                <?php else: ?>
                  <div class="forgot-row"><span>Forgot password?</span></div>
                <?php endif; ?>

                <?php if ($role === $active && $error !== ''): ?>
                  <div class="auth-error" role="alert"><?= htmlspecialchars($error) ?></div>
                <?php endif; ?>

                <div class="auth-actions-row">
                  <button type="submit" class="auth-btn primary" name="<?= $register ? 'register_submit' : 'login_submit' ?>"><?= $register ? 'Register' : 'Log in' ?></button>
                  <a class="auth-btn" href="<?= $info['other'] ?>"><?= $register ? 'Log in' : 'Register' ?></a>
                </div>
              </form>

              <div class="auth-switch">
                <?= htmlspecialchars($info['switch'][0]) ?> <a href="<?= $info['other'] ?>"><?= htmlspecialchars($info['switch'][1]) ?></a>
              </div>
            </div>
          <?php endforeach; ?>

          <div class="auth-socials">
            <a class="social-circle" href="https://twitter.com/Ikoolaii" aria-label="KoobD on X"><img src="assets/images/social/X.jpg" alt=""></a>
            <a class="social-circle" href="https://www.instagram.com/ikoolaii" aria-label="KoobD on Instagram"><img src="assets/images/social/instagram.jpg" alt=""></a>
            <a class="social-circle" href="https://www.facebook.com/juliane.delacruz.7" aria-label="KoobD on Facebook"><img src="assets/images/social/facebook.jpg" alt=""></a>
          </div>
        </div>
        <script>
          (() => {
            // Student / Teacher: show that form at once; the address and the
            // tab's title follow, so reloading or sharing the page keeps it.
            const card = document.querySelector('[data-auth-card]');
            if (!card) return;
            const tabs = Array.from(card.querySelectorAll('[data-auth-role]'));
            const panes = Array.from(card.querySelectorAll('[data-auth-pane]'));
            function choose(tab, focus) {
              const role = tab.dataset.authRole;
              tabs.forEach((item) => {
                const on = item === tab;
                item.classList.toggle('is-active', on);
                item.setAttribute('aria-selected', on ? 'true' : 'false');
                item.tabIndex = on ? 0 : -1;
              });
              panes.forEach((pane) => {
                const on = pane.dataset.authPane === role;
                pane.hidden = !on;
                pane.classList.toggle('is-entering', on);
              });
              if (window.location.pathname.split('/').pop() !== tab.dataset.authHref) {
                window.history.replaceState(null, '', tab.dataset.authHref);
              }
              document.title = tab.dataset.authTitle;
              if (focus) tab.focus();
            }
            tabs.forEach((tab) => {
              tab.tabIndex = tab.classList.contains('is-active') ? 0 : -1;
              tab.addEventListener('click', () => choose(tab, false));
              tab.addEventListener('keydown', (event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const next = tabs[(tabs.indexOf(tab) + 1) % tabs.length];
                choose(next, true);
              });
            });
          })();
        </script>
    <?php
}
