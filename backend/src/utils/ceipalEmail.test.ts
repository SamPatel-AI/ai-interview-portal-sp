import { describe, it, expect } from 'vitest';
import { parseCeipalNotificationEmail, htmlToText } from './ceipalEmail';

// Verbatim body of a real CEIPAL notification (Graph text rendering, 2026-07-01).
const REAL_BODY = `Pipeline Submission Notification from JobBoards

Hi,

Greetings from the house of CEIPAL.

This is to bring to your notice that a new application for the job post mentioned below has been filed by a candidate through ZipRecruiter.

Please find the Job and candidate details listed below:



Job Details

Job Title - Backend Software Engineer (Java / Spring Boot / GCP Data Engineering)

Job Location - Dearborn, Michigan, United States

Candidate Details

Candidate Name - Shahi Yella

Contact Number - 856-244-8094

Email ID - shahipoornima1@gmail.com

Submitted On - 07/01/26

Client - Ford Motors

Applicant Location - Jersey City, United States

Applicant Work Authorization - N/A

To view the details of the application please navigate through this Click here<https://talenthirecls11.ceipal.com/job_postings/applied_ext_candidate/dTkzNysyUEhwcDUzQ1VVMkdjUlBCdz09>

Brought to you by [https://connect.ceipal.com/img/ziprecruiter-logo.jpg]
[https://connect.ceipal.com/img/email_icons/ceipal-logo-2x.png]
Powered by Ceipal Corp.
`;

const REAL_SUBJECT =
  'ZipRecruiter applicant for  Ford Motors : JPC - 2352 : Backend Software Engineer (Java / Spring Boot / GCP Data Engineering) :  Shahi Yella';

describe('parseCeipalNotificationEmail', () => {
  it('parses a real Pipeline Submission notification', () => {
    const parsed = parseCeipalNotificationEmail(REAL_SUBJECT, REAL_BODY);
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      jpcCode: 'JPC - 2352',
      source: 'ZipRecruiter',
      clientName: 'Ford Motors',
      jobTitle: 'Backend Software Engineer (Java / Spring Boot / GCP Data Engineering)',
      firstName: 'Shahi',
      lastName: 'Yella',
      email: 'shahipoornima1@gmail.com',
      phone: '856-244-8094',
      location: 'Jersey City, United States',
      workAuthorization: null, // "N/A" in the email
    });
  });

  it('prefers the body candidate name and keeps multi-word last names', () => {
    const body = REAL_BODY.replace('Candidate Name - Shahi Yella', 'Candidate Name - Mary Jane van Dyk');
    const parsed = parseCeipalNotificationEmail(REAL_SUBJECT, body);
    expect(parsed?.firstName).toBe('Mary');
    expect(parsed?.lastName).toBe('Jane van Dyk');
  });

  it('falls back to the subject name when the body has none', () => {
    const body = REAL_BODY.replace(/^Candidate Name - .*$/m, '');
    const parsed = parseCeipalNotificationEmail(REAL_SUBJECT, body);
    expect(parsed?.firstName).toBe('Shahi');
    expect(parsed?.lastName).toBe('Yella');
  });

  it('returns null email when the body has no Email ID line', () => {
    const body = REAL_BODY.replace(/^Email ID - .*$/m, 'Email ID - N/A');
    const parsed = parseCeipalNotificationEmail(REAL_SUBJECT, body);
    expect(parsed?.email).toBeNull();
  });

  it('parses an HTML body via the html fallback', () => {
    const html =
      '<html><body><p>Candidate Details</p>' +
      '<p>Candidate Name - Shahi Yella</p>' +
      '<p>Email ID - shahipoornima1@gmail.com</p>' +
      '<p>Contact Number - 856-244-8094</p></body></html>';
    const parsed = parseCeipalNotificationEmail(REAL_SUBJECT, html);
    expect(parsed?.email).toBe('shahipoornima1@gmail.com');
    expect(parsed?.phone).toBe('856-244-8094');
  });

  it('rejects non-applicant CEIPAL emails (same sender, other templates)', () => {
    // Note-created / reassignment / account emails must not be ingested.
    expect(
      parseCeipalNotificationEmail('New Note is created for 123589 Darron Powell', 'A note was added.'),
    ).toBeNull();
    expect(
      parseCeipalNotificationEmail(
        'Job Posting JPC - 2191  SW Developer has been (re-)assigned',
        'The job posting was reassigned to you.',
      ),
    ).toBeNull();
    expect(
      parseCeipalNotificationEmail('Sam, A new user account is created for you', 'Welcome to CEIPAL.'),
    ).toBeNull();
  });

  it('keeps colons inside job titles and still finds the candidate name', () => {
    const subject = 'Dice applicant for Acme : JPC - 99 : Analyst: Level II : Jo Doe';
    const parsed = parseCeipalNotificationEmail(subject, REAL_BODY.replace('Shahi Yella', 'Jo Doe'));
    expect(parsed?.jpcCode).toBe('JPC - 99');
    expect(parsed?.jobTitle).toBe('Analyst : Level II');
    expect(parsed?.firstName).toBe('Jo');
  });
});

describe('htmlToText', () => {
  it('converts breaks and strips tags/entities', () => {
    expect(htmlToText('a<br>b&nbsp;&amp;<p>c</p>')).toBe('a\nb &c\n');
  });
});
