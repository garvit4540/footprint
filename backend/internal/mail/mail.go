package mail

import (
	"errors"
	"fmt"
	"net/smtp"
	"strings"
)

type Mailer struct {
	Host     string
	Port     string
	User     string
	Pass     string
	From     string
	FromName string
}

// FromEnv returns a Mailer ready to send, or nil if SMTP_USER/SMTP_PASS aren't set.
// Caller should treat a nil Mailer as "skip sending, just log".
func FromEnv(get func(string) string) *Mailer {
	user := get("SMTP_USER")
	pass := get("SMTP_PASS")
	if user == "" || pass == "" {
		return nil
	}
	host := get("SMTP_HOST")
	if host == "" {
		host = "smtp.gmail.com"
	}
	port := get("SMTP_PORT")
	if port == "" {
		port = "587"
	}
	from := get("SMTP_FROM")
	if from == "" {
		from = user
	}
	name := get("SMTP_FROM_NAME")
	if name == "" {
		name = "Footprint"
	}
	return &Mailer{Host: host, Port: port, User: user, Pass: pass, From: from, FromName: name}
}

// stripCRLF removes CR/LF and null bytes so a caller can't inject extra SMTP
// headers via a crafted subject / recipient.
func stripCRLF(s string) string {
	return strings.Map(func(r rune) rune {
		if r == '\r' || r == '\n' || r == 0 {
			return -1
		}
		return r
	}, s)
}

// Send transmits a single HTML email. Blocks until SMTP returns.
func (m *Mailer) Send(to, subject, htmlBody string) error {
	to = stripCRLF(to)
	if to == "" {
		return errors.New("mail: empty recipient")
	}
	subject = stripCRLF(subject)
	fromHeader := fmt.Sprintf("%s <%s>", stripCRLF(m.FromName), stripCRLF(m.From))
	headers := map[string]string{
		"From":         fromHeader,
		"To":           to,
		"Subject":      subject,
		"MIME-Version": "1.0",
		"Content-Type": `text/html; charset="UTF-8"`,
	}
	var msg strings.Builder
	for k, v := range headers {
		msg.WriteString(k)
		msg.WriteString(": ")
		msg.WriteString(v)
		msg.WriteString("\r\n")
	}
	msg.WriteString("\r\n")
	msg.WriteString(htmlBody)

	auth := smtp.PlainAuth("", m.User, m.Pass, m.Host)
	return smtp.SendMail(m.Host+":"+m.Port, auth, m.From, []string{to}, []byte(msg.String()))
}
