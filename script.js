const form = document.querySelector("#notify");
const emailInput = document.querySelector("#email");
const message = document.querySelector("#form-message");
const submitButton = form.querySelector("button[type='submit']");

document.querySelector("#year").textContent = new Date().getFullYear();

const hero = document.querySelector(".hero");
const botLogo = document.querySelector(".bot-logo");
const ambientElements = document.querySelectorAll(".ambient");
const scrollProgress = document.querySelector(".scroll-progress span");
let scrollFrame;

function updateScrollEffects() {
  const y = window.scrollY;
  const movement = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : Math.min(y, 400);

  hero.style.transform = `translateY(${movement * -0.035}px)`;
  botLogo.style.transform = `translateY(${movement * -0.09}px) rotate(${movement * 0.012}deg)`;

  ambientElements.forEach((element, index) => {
    const direction = index === 0 ? 1 : -1;
    element.style.transform = `translate3d(${movement * 0.06 * direction}px, ${movement * 0.08 * direction}px, 0)`;
  });

  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const progress = maxScroll > 0 ? y / maxScroll : 0;
  scrollProgress.style.transform = `scaleX(${Math.min(progress, 1)})`;

  document.body.classList.toggle("is-scrolling", y > 8);
  scrollFrame = null;
}

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("animate");
      entry.target.addEventListener("animationend", (event) => {
        if (event.target !== entry.target) return;
        entry.target.classList.remove("animate", "animate-on-scroll", "reveal-delay-one", "reveal-delay-two", "reveal-delay-three", "reveal-delay-four");
      }, { once: true });
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });

document.querySelectorAll(".animate-on-scroll").forEach((element) => {
  revealObserver.observe(element);
});

window.addEventListener("scroll", () => {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollEffects);
}, { passive: true });

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!form.reportValidity()) {
    return;
  }

  submitButton.disabled = true;
  message.textContent = "Submitting...";

  fetch("/api/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: emailInput.value.trim(),
      website: form.elements.website.value
    })
  })
    .then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Couldn't submit your email. Please try again.");
      return result;
    })
    .then(() => {
      message.textContent = "Thanks! Your email was sent to our team.";
      form.reset();
    })
    .catch((error) => {
      message.textContent = error.message || "Couldn't submit your email. Please try again.";
    })
    .finally(() => {
      submitButton.disabled = false;
      message.classList.remove("is-visible");
      void message.offsetWidth;
      message.classList.add("is-visible");
    });
});
