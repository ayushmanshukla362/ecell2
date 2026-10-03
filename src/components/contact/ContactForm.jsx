import { useState } from "react";

const initialFormData = {
  name: "",
  email: "",
  message: "",
};

function ContactForm() {
  const [formData, setFormData] = useState(initialFormData);
  const [formStatus, setFormStatus] = useState({ type: "", message: "" });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((currentData) => ({ ...currentData, [name]: value }));
    if (formStatus.message) {
      setFormStatus({ type: "", message: "" });
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const name = formData.name.trim();
    const email = formData.email.trim();
    const message = formData.message.trim();

    if (!name || !email || !message) {
      setFormStatus({
        type: "error",
        message: "Please complete all required fields before sending.",
      });
      return;
    }

    if (name.length < 2 || message.length < 10) {
      setFormStatus({
        type: "error",
        message: "Please add a little more detail so we can help.",
      });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormStatus({
        type: "error",
        message: "Please enter a valid email address.",
      });
      return;
    }

    const subject = `Contact from ${name}`;
    const body = `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`;
    const mailtoUrl = `mailto:ecell@abes.ac.in?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    setFormStatus({
      type: "success",
      message: "Your email app should open with your message ready to send.",
    });
    window.location.href = mailtoUrl;
  };

  return (
    <form onSubmit={handleSubmit} className="contact-form" noValidate>
      <div className="contact-form__split">
        <div>
          <label htmlFor="contact-name">
            Name <span className="text-[#ffde59]" aria-hidden="true">*</span>
          </label>
          <input
            id="contact-name"
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="Your name"
            autoComplete="name"
            required
            minLength="2"
            className="contact-form__input"
          />
        </div>
        <div>
          <label htmlFor="contact-email">
            Email <span className="text-[#ffde59]" aria-hidden="true">*</span>
          </label>
          <input
            id="contact-email"
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="you@example.com"
            autoComplete="email"
            required
            className="contact-form__input"
          />
        </div>
      </div>

      <div>
        <label htmlFor="contact-message">
          Message <span className="text-[#ffde59]" aria-hidden="true">*</span>
        </label>
        <textarea
          id="contact-message"
          name="message"
          value={formData.message}
          onChange={handleChange}
          placeholder="Tell us how we can help..."
          required
          minLength="10"
          rows="5"
          className="contact-form__input contact-form__textarea"
        />
      </div>

      <button
        type="submit"
        className="contact-form__submit"
      >
        Send message
        <span aria-hidden="true">↗</span>
      </button>

      <p
        role={formStatus.type === "error" ? "alert" : "status"}
        aria-live="polite"
        className={`contact-form__status ${formStatus.type === "error" ? "is-error" : ""}`}
      >
        {formStatus.message}
      </p>
    </form>
  );
}

export default ContactForm;
