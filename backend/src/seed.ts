import { config } from 'dotenv';
config();

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function seed() {
  console.log('🌱 Seeding database...\n');

  // ─── Get the existing org and user (created during signup) ──
  const { data: existingUser } = await supabase
    .from('users')
    .select('id, org_id, email')
    .eq('email', 'sahil@saanvi.us')
    .single();

  if (!existingUser) {
    console.error('❌ No user found. Please signup first with sahil@saanvi.us');
    process.exit(1);
  }

  const orgId = existingUser.org_id;
  const userId = existingUser.id;
  console.log(`✅ Found user: ${existingUser.email} (org: ${orgId})\n`);

  // ─── Update org name ─────────────────────────────────────
  await supabase
    .from('organizations')
    .update({ name: 'Saanvi Technology' })
    .eq('id', orgId);
  console.log('✅ Organization: Saanvi Technology');

  // ─── Create Client Companies ─────────────────────────────
  const companies = [
    { name: 'Ford Motor Company', description: 'American multinational automobile manufacturer. Active hiring for software engineering, data, and IT roles.', org_id: orgId },
    { name: 'Toyota Financial Services', description: 'Financial services arm of Toyota. Hiring for full-stack developers and cloud engineers.', org_id: orgId },
    { name: 'Blue Cross Blue Shield', description: 'Healthcare insurance provider. Needs QA engineers, .NET developers, and project managers.', org_id: orgId },
    { name: 'Rocket Mortgage', description: 'Leading mortgage lender. Hiring React developers, DevOps engineers, and data analysts.', org_id: orgId },
    { name: 'General Motors', description: 'Global automotive company. Active positions in embedded systems, cloud, and AI/ML.', org_id: orgId },
  ];

  const { data: companyRows } = await supabase
    .from('client_companies')
    .upsert(companies, { onConflict: 'org_id,name', ignoreDuplicates: true })
    .select('id, name');

  // Fetch all companies (in case upsert returned nothing due to duplicates)
  const { data: allCompanies } = await supabase
    .from('client_companies')
    .select('id, name')
    .eq('org_id', orgId);

  const companyMap = new Map((allCompanies ?? []).map(c => [c.name, c.id]));
  console.log(`✅ Companies: ${allCompanies?.length} created/found`);

  // ─── Create AI Agents ────────────────────────────────────
  const agentConfigs = [
    {
      name: 'Ford Tech Interviewer',
      client_company_id: companyMap.get('Ford Motor Company'),
      voice_id: '11labs-Adrian',
      interview_style: 'technical' as const,
      system_prompt: `You are a professional AI screening interviewer for Ford Motor Company. You conduct first-round technical screening interviews.

Candidate: {{candidate_name}}
Position: {{job_title}}

Instructions:
1. Greet the candidate and confirm identity
2. Explain this is a 15-20 minute screening
3. Ask mandatory questions first
4. Then ask technical interview questions
5. Allow candidate questions at the end

Mandatory Questions:
{{mandate_questions}}

Interview Questions:
{{interview_questions}}

{{call_context}}

Be professional, assess technical depth, and keep within 20 minutes.`,
      max_call_duration_sec: 1200,
      language: 'en-US',
      greeting_template: 'Hello {{candidate_name}}, this is the Ford recruitment screening line. Thank you for taking the time to speak with us today.',
      closing_template: 'Thank you for your time today. Our recruitment team will review your responses and get back to you within 2-3 business days.',
    },
    {
      name: 'Toyota Conversational Screener',
      client_company_id: companyMap.get('Toyota Financial Services'),
      voice_id: '11labs-Amy',
      interview_style: 'conversational' as const,
      system_prompt: `You are a friendly AI screening interviewer for Toyota Financial Services. You conduct conversational first-round screenings.

Candidate: {{candidate_name}}
Position: {{job_title}}

Instructions:
1. Greet warmly and confirm identity
2. Brief intro about the screening
3. Ask mandatory questions
4. Ask role-specific questions conversationally
5. Close professionally

Mandatory Questions:
{{mandate_questions}}

Interview Questions:
{{interview_questions}}

{{call_context}}

Keep the tone warm and conversational. Focus on cultural fit alongside technical skills.`,
      max_call_duration_sec: 900,
      language: 'en-US',
      greeting_template: 'Hi {{candidate_name}}, welcome! I am calling on behalf of Toyota Financial Services recruitment team.',
      closing_template: 'It was great chatting with you. You will hear from us soon!',
    },
    {
      name: 'BCBS Formal Screener',
      client_company_id: companyMap.get('Blue Cross Blue Shield'),
      voice_id: '11labs-Brian',
      interview_style: 'formal' as const,
      system_prompt: `You are a formal AI screening interviewer for Blue Cross Blue Shield. Conduct structured screening interviews for healthcare IT positions.

Candidate: {{candidate_name}}
Position: {{job_title}}

Mandatory Questions:
{{mandate_questions}}

Interview Questions:
{{interview_questions}}

{{call_context}}

Maintain a professional, structured approach. Healthcare compliance awareness is important.`,
      max_call_duration_sec: 1200,
      language: 'en-US',
    },
  ];

  for (const agentConfig of agentConfigs) {
    const { data: existingAgent } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('org_id', orgId)
      .eq('name', agentConfig.name)
      .single();

    if (!existingAgent) {
      await supabase.from('ai_agents').insert({
        ...agentConfig,
        org_id: orgId,
        created_by: userId,
        evaluation_criteria: {
          categories: [
            { name: 'Technical Fit', description: 'Skills match to job requirements', weight: 0.3 },
            { name: 'Communication', description: 'Clarity and effectiveness', weight: 0.2 },
            { name: 'Experience Relevance', description: 'Past experience alignment', weight: 0.25 },
            { name: 'Cultural Fit', description: 'Team and company alignment', weight: 0.15 },
            { name: 'Enthusiasm', description: 'Interest and motivation level', weight: 0.1 },
          ],
        },
      });
    }
  }

  const { data: allAgents } = await supabase
    .from('ai_agents')
    .select('id, name, client_company_id')
    .eq('org_id', orgId);

  const agentMap = new Map((allAgents ?? []).map(a => [a.name, a.id]));
  console.log(`✅ AI Agents: ${allAgents?.length} created/found`);

  // ─── Create Jobs ─────────────────────────────────────────
  const jobs = [
    {
      org_id: orgId,
      client_company_id: companyMap.get('Ford Motor Company'),
      ceipal_job_id: 'JPC-2178',
      title: 'Senior Full Stack Application Developer',
      description: 'Design and develop enterprise-grade web applications using Java, Spring Boot, React, and AWS. Modernize legacy systems to microservices architecture. Lead code reviews and mentor junior developers.',
      skills: ['Java', 'Spring Boot', 'React', 'AWS', 'Microservices', 'REST APIs', 'PostgreSQL', 'Docker', 'Kubernetes'],
      location: 'Dearborn, MI',
      state: 'Michigan',
      country: 'United States',
      tax_terms: 'W2',
      employment_type: 'full_time' as const,
      status: 'open' as const,
      ai_agent_id: agentMap.get('Ford Tech Interviewer'),
      assigned_recruiter_id: userId,
    },
    {
      org_id: orgId,
      client_company_id: companyMap.get('Ford Motor Company'),
      ceipal_job_id: 'JPC-2195',
      title: 'Cloud DevOps Engineer',
      description: 'Build and maintain CI/CD pipelines, manage AWS infrastructure, implement infrastructure as code with Terraform. Support production deployments and incident response.',
      skills: ['AWS', 'Terraform', 'Jenkins', 'Docker', 'Kubernetes', 'Python', 'Linux', 'Ansible', 'CloudFormation'],
      location: 'Dearborn, MI',
      state: 'Michigan',
      country: 'United States',
      tax_terms: 'C2C',
      employment_type: 'contract' as const,
      status: 'open' as const,
      ai_agent_id: agentMap.get('Ford Tech Interviewer'),
      assigned_recruiter_id: userId,
    },
    {
      org_id: orgId,
      client_company_id: companyMap.get('Toyota Financial Services'),
      ceipal_job_id: 'JPC-3042',
      title: 'React Frontend Developer',
      description: 'Build modern financial dashboards using React, TypeScript, and GraphQL. Work closely with UX designers to deliver pixel-perfect interfaces. Optimize for performance and accessibility.',
      skills: ['React', 'TypeScript', 'GraphQL', 'Tailwind CSS', 'Jest', 'Cypress', 'Figma', 'REST APIs'],
      location: 'Plano, TX',
      state: 'Texas',
      country: 'United States',
      tax_terms: 'W2',
      employment_type: 'full_time' as const,
      status: 'open' as const,
      ai_agent_id: agentMap.get('Toyota Conversational Screener'),
      assigned_recruiter_id: userId,
    },
    {
      org_id: orgId,
      client_company_id: companyMap.get('Blue Cross Blue Shield'),
      ceipal_job_id: 'JPC-4510',
      title: 'QA Automation Engineer',
      description: 'Design and implement automated testing frameworks for healthcare applications. HIPAA compliance testing, API testing, performance testing. Work with Selenium, Cypress, and JMeter.',
      skills: ['Selenium', 'Cypress', 'Java', 'Python', 'REST API Testing', 'JMeter', 'HIPAA', 'CI/CD', 'Postman'],
      location: 'Chicago, IL',
      state: 'Illinois',
      country: 'United States',
      tax_terms: 'W2',
      employment_type: 'full_time' as const,
      status: 'open' as const,
      ai_agent_id: agentMap.get('BCBS Formal Screener'),
      assigned_recruiter_id: userId,
    },
    {
      org_id: orgId,
      client_company_id: companyMap.get('Rocket Mortgage'),
      ceipal_job_id: 'JPC-5200',
      title: 'Data Analyst - Mortgage Operations',
      description: 'Analyze mortgage pipeline data, build dashboards in Tableau/Power BI, write SQL queries for reporting, identify process improvement opportunities.',
      skills: ['SQL', 'Python', 'Tableau', 'Power BI', 'Excel', 'Data Modeling', 'ETL', 'Statistics'],
      location: 'Detroit, MI',
      state: 'Michigan',
      country: 'United States',
      tax_terms: 'W2',
      employment_type: 'contract' as const,
      status: 'open' as const,
      assigned_recruiter_id: userId,
    },
    {
      org_id: orgId,
      client_company_id: companyMap.get('General Motors'),
      ceipal_job_id: 'JPC-6100',
      title: 'Embedded Software Engineer',
      description: 'Develop embedded software for vehicle control systems using C/C++. Work with AUTOSAR, CAN protocols, and real-time operating systems.',
      skills: ['C', 'C++', 'Embedded Systems', 'AUTOSAR', 'CAN', 'RTOS', 'Git', 'JIRA', 'Unit Testing'],
      location: 'Warren, MI',
      state: 'Michigan',
      country: 'United States',
      tax_terms: 'W2',
      employment_type: 'full_time' as const,
      status: 'open' as const,
      assigned_recruiter_id: userId,
    },
  ];

  for (const job of jobs) {
    const { data: existing } = await supabase
      .from('jobs')
      .select('id')
      .eq('org_id', orgId)
      .eq('ceipal_job_id', job.ceipal_job_id)
      .single();

    if (!existing) {
      await supabase.from('jobs').insert(job);
    }
  }

  const { data: allJobs } = await supabase
    .from('jobs')
    .select('id, title, ceipal_job_id')
    .eq('org_id', orgId);

  const jobMap = new Map((allJobs ?? []).map(j => [j.ceipal_job_id, j.id]));
  console.log(`✅ Jobs: ${allJobs?.length} created/found`);

  // ─── Create Candidates ───────────────────────────────────
  const candidates = [
    {
      org_id: orgId,
      first_name: 'Seethalakshmi',
      last_name: 'Ramanathan',
      email: 'seetha.ram@gmail.com',
      phone: '+15625757224',
      location: 'Detroit, MI',
      work_authorization: 'H1B',
      source: 'CEIPAL',
      resume_text: `Seethalakshmi Ramanathan | Senior Full Stack Developer
Detroit, MI | seetha.ram@gmail.com | (562) 575-7224

SUMMARY: 8+ years of experience in Java, Spring Boot, React, and AWS. Expertise in microservices architecture, RESTful APIs, and cloud-native applications. Led modernization of legacy monoliths to microservices at Wells Fargo.

EXPERIENCE:
Wells Fargo - Senior Software Engineer (2021-Present)
- Led migration of legacy Java monolith to Spring Boot microservices, improving deployment frequency by 300%
- Designed RESTful APIs serving 2M+ requests/day with 99.9% uptime
- Implemented React-based dashboards for real-time transaction monitoring
- Mentored team of 5 junior developers

Infosys - Software Developer (2018-2021)
- Built enterprise applications using Java, Spring, and Angular
- Developed CI/CD pipelines with Jenkins and Docker
- Managed PostgreSQL databases with complex query optimization

SKILLS: Java, Spring Boot, React, TypeScript, AWS (EC2, S3, Lambda, RDS), Docker, Kubernetes, PostgreSQL, MongoDB, REST APIs, GraphQL, Microservices, Git, Jenkins, Agile/Scrum

EDUCATION: M.S. Computer Science, Wayne State University, 2018`,
    },
    {
      org_id: orgId,
      first_name: 'Andrew',
      last_name: 'Kieltyka',
      email: 'andrew.k@outlook.com',
      phone: '+13135551234',
      location: 'Ann Arbor, MI',
      work_authorization: 'US Citizen',
      source: 'CEIPAL',
      resume_text: `Andrew Kieltyka | Cloud DevOps Engineer
Ann Arbor, MI | andrew.k@outlook.com | (313) 555-1234

SUMMARY: 6 years in DevOps and cloud infrastructure. AWS Certified Solutions Architect. Expert in Terraform, Kubernetes, and CI/CD automation.

EXPERIENCE:
Amazon - DevOps Engineer (2022-Present)
- Managed 200+ AWS accounts using Terraform and CloudFormation
- Built zero-downtime deployment pipelines serving 50M+ users
- Reduced infrastructure costs by 35% through right-sizing and spot instances

Deloitte - Cloud Engineer (2020-2022)
- Designed multi-region AWS architectures for Fortune 500 clients
- Implemented Kubernetes clusters for containerized microservices
- Automated compliance scanning with AWS Config and Lambda

SKILLS: AWS, Terraform, Kubernetes, Docker, Jenkins, GitHub Actions, Python, Bash, Linux, Ansible, CloudFormation, Datadog, Splunk, Prometheus, Grafana

CERTIFICATIONS: AWS Solutions Architect Professional, AWS DevOps Engineer Professional, CKA

EDUCATION: B.S. Computer Engineering, University of Michigan, 2019`,
    },
    {
      org_id: orgId,
      first_name: 'Priya',
      last_name: 'Sharma',
      email: 'priya.sharma@yahoo.com',
      phone: '+12145559876',
      location: 'Plano, TX',
      work_authorization: 'Green Card',
      source: 'CEIPAL',
      resume_text: `Priya Sharma | React Frontend Developer
Plano, TX | priya.sharma@yahoo.com | (214) 555-9876

SUMMARY: 5 years building modern web applications with React and TypeScript. Passionate about UI/UX, accessibility, and performance optimization.

EXPERIENCE:
Capital One - Senior Frontend Engineer (2022-Present)
- Led redesign of customer-facing banking dashboard using React + TypeScript
- Implemented GraphQL data layer reducing API calls by 60%
- Achieved 95+ Lighthouse scores across all pages
- Mentored 3 junior developers on React best practices

Wipro - Frontend Developer (2020-2022)
- Built responsive SPAs using React, Redux, and Material UI
- Integrated REST APIs and implemented client-side caching
- Created reusable component library used across 4 products

SKILLS: React, TypeScript, JavaScript, GraphQL, Next.js, Tailwind CSS, Jest, Cypress, Storybook, Figma, REST APIs, Redux, Webpack, Vite

EDUCATION: B.Tech Computer Science, VIT University, India, 2019`,
    },
    {
      org_id: orgId,
      first_name: 'Marcus',
      last_name: 'Johnson',
      email: 'marcus.j.test@gmail.com',
      phone: '+13125554567',
      location: 'Chicago, IL',
      work_authorization: 'US Citizen',
      source: 'CEIPAL',
      resume_text: `Marcus Johnson | QA Automation Engineer
Chicago, IL | marcus.j.test@gmail.com | (312) 555-4567

SUMMARY: 7 years in quality assurance with focus on test automation for healthcare and financial applications. ISTQB certified. Expert in Selenium, Cypress, and API testing.

EXPERIENCE:
UnitedHealth Group - Senior QA Engineer (2021-Present)
- Built Selenium + Java automation framework covering 2000+ test cases
- Implemented HIPAA compliance testing suite for claims processing system
- Reduced regression testing time from 3 days to 4 hours
- Led performance testing using JMeter for systems handling 100K+ transactions/day

Accenture - QA Analyst (2018-2021)
- Automated API testing with Postman/Newman and REST Assured
- Designed test strategies for Agile teams
- Created Cypress E2E test suites for React applications

SKILLS: Selenium, Cypress, Java, Python, REST API Testing, JMeter, Postman, HIPAA, CI/CD, Jenkins, TestNG, Cucumber, SQL, Git, JIRA, Agile

CERTIFICATIONS: ISTQB Advanced Level, AWS Cloud Practitioner

EDUCATION: B.S. Information Systems, DePaul University, 2017`,
    },
    {
      org_id: orgId,
      first_name: 'Jennifer',
      last_name: 'Liu',
      email: 'jen.liu.dev@gmail.com',
      phone: '+12485558901',
      location: 'Troy, MI',
      work_authorization: 'US Citizen',
      source: 'Email',
      resume_text: `Jennifer Liu | Full Stack Developer
Troy, MI | jen.liu.dev@gmail.com | (248) 555-8901

SUMMARY: 4 years developing web applications. Strong in React and Node.js. Looking to grow into senior roles.

EXPERIENCE:
Quicken Loans - Software Developer (2022-Present)
- Develop mortgage application features using React and Node.js
- Write REST APIs with Express and PostgreSQL
- Participate in code reviews and sprint planning

Startup XYZ - Junior Developer (2021-2022)
- Built MVP features using React and Firebase
- Implemented user authentication and payment integration

SKILLS: React, Node.js, JavaScript, TypeScript, PostgreSQL, MongoDB, Express, Git, HTML/CSS, Tailwind

EDUCATION: B.S. Computer Science, Oakland University, 2021`,
    },
    {
      org_id: orgId,
      first_name: 'Rajesh',
      last_name: 'Kumar',
      email: 'rajesh.k.engineer@gmail.com',
      phone: '+14085553210',
      location: 'San Jose, CA',
      work_authorization: 'H1B',
      source: 'CEIPAL',
      resume_text: `Rajesh Kumar | Embedded Software Engineer
San Jose, CA | rajesh.k.engineer@gmail.com | (408) 555-3210

SUMMARY: 10 years in embedded systems development. Expert in C/C++, AUTOSAR, and automotive control systems. Currently at Tesla.

EXPERIENCE:
Tesla - Embedded Software Engineer (2021-Present)
- Develop firmware for vehicle control modules using C/C++
- Implement AUTOSAR-compliant software components
- Debug real-time systems using oscilloscopes and JTAG
- Lead code reviews for safety-critical embedded software

Robert Bosch - Senior Embedded Developer (2017-2021)
- Developed CAN/LIN communication drivers for ECUs
- Implemented RTOS-based control algorithms
- Achieved ISO 26262 ASIL-D compliance for braking system software

SKILLS: C, C++, Embedded C, AUTOSAR, CAN, LIN, RTOS (FreeRTOS, QNX), JTAG, Git, JIRA, ISO 26262, MISRA C, Unit Testing, Python scripting

EDUCATION: M.S. Electrical Engineering, San Jose State University, 2016`,
    },
    {
      org_id: orgId,
      first_name: 'Sarah',
      last_name: 'Mitchell',
      email: 'sarah.mitchell.data@gmail.com',
      phone: '+13135557654',
      location: 'Detroit, MI',
      work_authorization: 'US Citizen',
      source: 'Email',
      resume_text: `Sarah Mitchell | Data Analyst
Detroit, MI | sarah.mitchell.data@gmail.com | (313) 555-7654

SUMMARY: 3 years in data analytics. Proficient in SQL, Python, and Tableau. Strong business acumen in financial services.

EXPERIENCE:
Ally Financial - Data Analyst (2023-Present)
- Build Tableau dashboards tracking mortgage pipeline KPIs
- Write complex SQL queries for ad-hoc reporting
- Automate data extraction with Python scripts

Bank of America - Junior Analyst (2022-2023)
- Created weekly reports using Excel and SQL
- Assisted in data migration projects

SKILLS: SQL, Python, Tableau, Power BI, Excel, Data Modeling, ETL, Pandas, Statistics, Git

EDUCATION: B.S. Statistics, Michigan State University, 2022`,
    },
    {
      org_id: orgId,
      first_name: 'David',
      last_name: 'Park',
      email: 'david.park.dev@gmail.com',
      phone: '+12145552345',
      location: 'Dallas, TX',
      work_authorization: 'Green Card',
      source: 'CEIPAL',
      resume_text: `David Park | React Developer
Dallas, TX | david.park.dev@gmail.com | (214) 555-2345

SUMMARY: 3 years in frontend development. Focused on React and modern JavaScript.

EXPERIENCE:
AT&T - Frontend Developer (2023-Present)
- Build customer portal features with React
- Implement responsive designs with Tailwind CSS

Freelance (2022-2023)
- Built 5+ client websites using React and Next.js

SKILLS: React, JavaScript, TypeScript, Tailwind CSS, HTML, CSS, Git, REST APIs, Next.js

EDUCATION: B.S. Computer Science, UT Dallas, 2022`,
    },
  ];

  for (const cand of candidates) {
    const { data: existing } = await supabase
      .from('candidates')
      .select('id')
      .eq('org_id', orgId)
      .eq('email', cand.email)
      .single();

    if (!existing) {
      await supabase.from('candidates').insert(cand);
    }
  }

  const { data: allCandidates } = await supabase
    .from('candidates')
    .select('id, email, first_name, last_name')
    .eq('org_id', orgId);

  const candMap = new Map((allCandidates ?? []).map(c => [c.email, c.id]));
  console.log(`✅ Candidates: ${allCandidates?.length} created/found`);

  // ─── Create Applications (candidate → job mapping) ───────
  const applications = [
    // Seethalakshmi → Ford Senior Full Stack (great fit)
    { candidate_email: 'seetha.ram@gmail.com', job_code: 'JPC-2178' },
    // Andrew → Ford Cloud DevOps (great fit)
    { candidate_email: 'andrew.k@outlook.com', job_code: 'JPC-2195' },
    // Priya → Toyota React Frontend (great fit)
    { candidate_email: 'priya.sharma@yahoo.com', job_code: 'JPC-3042' },
    // Marcus → BCBS QA Automation (great fit)
    { candidate_email: 'marcus.j.test@gmail.com', job_code: 'JPC-4510' },
    // Jennifer → Ford Senior Full Stack (moderate fit - junior)
    { candidate_email: 'jen.liu.dev@gmail.com', job_code: 'JPC-2178' },
    // Rajesh → GM Embedded Software (great fit)
    { candidate_email: 'rajesh.k.engineer@gmail.com', job_code: 'JPC-6100' },
    // Sarah → Rocket Mortgage Data Analyst (good fit)
    { candidate_email: 'sarah.mitchell.data@gmail.com', job_code: 'JPC-5200' },
    // David → Toyota React Frontend (moderate fit - junior)
    { candidate_email: 'david.park.dev@gmail.com', job_code: 'JPC-3042' },
    // Cross-application: Seethalakshmi also applied for DevOps
    { candidate_email: 'seetha.ram@gmail.com', job_code: 'JPC-2195' },
  ];

  let appCount = 0;
  for (const app of applications) {
    const candidateId = candMap.get(app.candidate_email);
    const jobId = jobMap.get(app.job_code);

    if (!candidateId || !jobId) continue;

    const { data: existing } = await supabase
      .from('applications')
      .select('id')
      .eq('candidate_id', candidateId)
      .eq('job_id', jobId)
      .single();

    if (!existing) {
      await supabase.from('applications').insert({
        org_id: orgId,
        candidate_id: candidateId,
        job_id: jobId,
        status: 'new',
        assigned_recruiter_id: userId,
      });
      appCount++;
    }
  }

  const { data: allApps } = await supabase
    .from('applications')
    .select('id, candidate_id, job_id')
    .eq('org_id', orgId);

  console.log(`✅ Applications: ${allApps?.length} created/found`);

  // ─── Run AI Screening on first 4 applications ────────────
  console.log('\n🤖 Running AI screening on top candidates (this takes ~30 seconds)...\n');

  const appsToScreen = allApps?.slice(0, 4) ?? [];

  for (const app of appsToScreen) {
    // Check if already screened
    const { data: appDetail } = await supabase
      .from('applications')
      .select('ai_screening_score')
      .eq('id', app.id)
      .single();

    if (appDetail?.ai_screening_score !== null) {
      console.log(`   ⏭️  Application ${app.id} already screened, skipping`);
      continue;
    }

    // Get candidate resume and job details
    const { data: candidate } = await supabase
      .from('candidates')
      .select('resume_text, first_name, last_name')
      .eq('id', app.candidate_id)
      .single();

    const { data: job } = await supabase
      .from('jobs')
      .select('title, description, skills, state, country, tax_terms')
      .eq('id', app.job_id)
      .single();

    if (!candidate?.resume_text || !job) continue;

    try {
      // Call OpenRouter for screening
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are an expert technical recruiter. Analyze the resume against the job and return JSON with:
- candidate_strengths: string[]
- candidate_weaknesses: string[]
- risk_factor: { score: "Low"|"Medium"|"High", explanation: string }
- reward_factor: { score: "Low"|"Medium"|"High", explanation: string }
- overall_fit_rating: number (0-10 integer)
- justification_for_rating: string
- mandate_questions: string[] (2 questions: visa + location)
- interview_questions: string[] (10 role-specific questions)

Job: ${job.title}
Description: ${job.description}
Skills: ${job.skills.join(', ')}
Location: ${job.state}, ${job.country}
Return ONLY valid JSON.`,
            },
            { role: 'user', content: `Resume:\n${candidate.resume_text}` },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        }),
      });

      const result = await response.json() as any;
      const screening = JSON.parse(result.choices[0].message.content);

      // Ensure mandate questions
      screening.mandate_questions = [
        'What is your current work authorization or visa status?',
        `This role is based in ${job.state}, ${job.country}. Are you currently located here, and if not, are you open to relocation?`,
      ];

      await supabase
        .from('applications')
        .update({
          ai_screening_score: screening.overall_fit_rating,
          ai_screening_result: screening,
          mandate_questions: screening.mandate_questions,
          interview_questions: screening.interview_questions,
          status: 'screening',
        })
        .eq('id', app.id);

      console.log(`   ✅ ${candidate.first_name} ${candidate.last_name} → ${job.title}: Score ${screening.overall_fit_rating}/10`);
    } catch (err) {
      console.log(`   ❌ Screening failed for ${candidate.first_name}: ${err}`);
    }
  }

  // ─── Create sample call records (simulated past calls) ───
  // Get a screened application for call data
  const { data: screenedApps } = await supabase
    .from('applications')
    .select('id, candidate_id, job_id, jobs (ai_agent_id)')
    .eq('org_id', orgId)
    .not('ai_screening_score', 'is', null)
    .limit(2);

  if (screenedApps?.length) {
    for (const app of screenedApps) {
      const agentId = (app.jobs as any)?.ai_agent_id;
      if (!agentId) continue;

      // Check if call already exists
      const { data: existingCall } = await supabase
        .from('calls')
        .select('id')
        .eq('application_id', app.id)
        .limit(1)
        .single();

      if (existingCall) continue;

      // Create a completed call record
      const startTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const endTime = new Date(startTime.getTime() + 15 * 60 * 1000); // 15 min later

      await supabase.from('calls').insert({
        org_id: orgId,
        application_id: app.id,
        candidate_id: app.candidate_id,
        ai_agent_id: agentId,
        retell_call_id: `call_seed_${app.id.substring(0, 8)}`,
        direction: 'outbound',
        status: 'completed',
        from_number: '+12404433697',
        to_number: '+15625757224',
        started_at: startTime.toISOString(),
        ended_at: endTime.toISOString(),
        duration_seconds: 900,
        transcript: `Agent: Hello, thank you for taking the time to speak with us today. Am I speaking with the right candidate?\n\nUser: Yes, this is me. Thank you for calling.\n\nAgent: Great! I'm calling on behalf of the recruitment team. This will be a brief 15-20 minute screening interview. Shall we get started?\n\nUser: Sure, I'm ready.\n\nAgent: First, could you tell me about your current work authorization status?\n\nUser: I'm currently on an H1B visa, and my employer is sponsoring me. I'm also in the process of getting my green card.\n\nAgent: Thank you. And regarding the role location - this position is based in Michigan. Are you currently in the area or open to relocation?\n\nUser: Yes, I'm already based in the Detroit metro area, so location is not an issue.\n\nAgent: Perfect. Now let's talk about your technical experience. Can you describe a complex project where you used Java and Spring Boot?\n\nUser: At Wells Fargo, I led the migration of our legacy Java monolith to Spring Boot microservices. We broke down a 500,000-line codebase into 12 independent services. The biggest challenge was maintaining data consistency across services - we implemented the saga pattern with event sourcing using Apache Kafka.\n\nAgent: Impressive. How did you handle the deployment pipeline for those microservices?\n\nUser: We used Jenkins for CI and Kubernetes on AWS EKS for deployment. Each service had its own pipeline with unit tests, integration tests, and automated security scanning. We achieved zero-downtime deployments using rolling updates.\n\nAgent: What about your experience with React on the frontend?\n\nUser: I built the real-time transaction monitoring dashboard using React with TypeScript. We used Redux for state management and WebSockets for live data updates. The dashboard handles about 10,000 concurrent users.\n\nAgent: How do you approach debugging production issues?\n\nUser: I follow a systematic approach - first check monitoring dashboards in Datadog, then trace the request through our distributed tracing system using Jaeger. For the most critical issues, I set up alerts on key metrics so we catch problems before users report them.\n\nAgent: Thank you for sharing that. Do you have any questions for us?\n\nUser: Yes, I'd like to know more about the team structure and the tech stack you're currently using.\n\nAgent: The team is about 15 engineers split into frontend and backend squads. The stack is primarily Java and Spring Boot on the backend with React frontends. You'd be working on modernization initiatives similar to what you described at Wells Fargo.\n\nUser: That sounds great. I'm very interested in the role.\n\nAgent: Wonderful. Thank you for your time today. Our recruitment team will review your responses and get back to you within 2-3 business days. Have a great day!\n\nUser: Thank you, you too!`,
        call_analysis: {
          call_summary: 'Strong candidate with relevant experience in Java/Spring Boot microservices migration. Currently on H1B with green card pending. Based in Detroit area. Demonstrated deep technical knowledge in distributed systems, CI/CD, and React. Very interested in the role.',
          in_voicemail: false,
          user_sentiment: 'Positive',
          call_successful: true,
          custom_analysis_data: {
            callback_requested: false,
            callback_time_minutes: 0,
          },
        },
        call_cost: {
          total_duration_seconds: 900,
          combined_cost: 3.25,
        },
      });
    }
  }

  const { data: allCalls } = await supabase
    .from('calls')
    .select('id')
    .eq('org_id', orgId);

  console.log(`✅ Calls: ${allCalls?.length} created/found`);

  // ─── Create Activity Log entries ─────────────────────────
  const activities = [
    { entity_type: 'candidate', action: 'intake_received', details: { email: 'seetha.ram@gmail.com', source: 'CEIPAL' } },
    { entity_type: 'candidate', action: 'intake_received', details: { email: 'andrew.k@outlook.com', source: 'CEIPAL' } },
    { entity_type: 'application', action: 'ai_screening_complete', details: { score: 8, candidate: 'Seethalakshmi Ramanathan' } },
    { entity_type: 'application', action: 'ai_screening_complete', details: { score: 9, candidate: 'Andrew Kieltyka' } },
    { entity_type: 'call', action: 'outbound_call_initiated', details: { candidate: 'Seethalakshmi Ramanathan', job: 'Senior Full Stack Developer' } },
    { entity_type: 'call', action: 'call_completed', details: { candidate: 'Seethalakshmi Ramanathan', duration: 900 } },
    { entity_type: 'job', action: 'ceipal_sync', details: { synced: 6, created: 6, updated: 0 } },
  ];

  // Check if activity already seeded
  const { count: activityCount } = await supabase
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);

  if ((activityCount ?? 0) < 5) {
    for (const activity of activities) {
      await supabase.from('activity_log').insert({
        org_id: orgId,
        user_id: userId,
        entity_type: activity.entity_type,
        entity_id: orgId, // placeholder
        action: activity.action,
        details: activity.details,
      });
    }
    console.log(`✅ Activity Log: ${activities.length} entries created`);
  } else {
    console.log(`✅ Activity Log: already seeded`);
  }

  // ─── Summary ─────────────────────────────────────────────
  console.log('\n' + '='.repeat(50));
  console.log('🎉 SEED COMPLETE!');
  console.log('='.repeat(50));
  console.log(`
Organization: Saanvi Technology
Companies:    ${allCompanies?.length}
AI Agents:    ${allAgents?.length}
Jobs:         ${allJobs?.length}
Candidates:   ${allCandidates?.length}
Applications: ${allApps?.length}
Calls:        ${allCalls?.length}

Login: sahil@saanvi.us / Test@1234

You can now test the full portal!
  `);
}

seed().catch(console.error);
