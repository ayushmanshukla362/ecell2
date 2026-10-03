import { useMemo, useState } from 'react'

/* eslint-disable react/prop-types */

const volunteersData = {
  '2024-2025': [
    ['Satyam Raj Singh', 'Events and Planning'], ['Sahil Kumar Sahu', 'Events and Planning'], ['Ayush Aggarwal', 'Events and Planning'], ['Srishti Yadav', 'Events and Planning'], ['Shreya Singh', 'Events and Planning'], ['Ayush Gautam', 'Events and Planning'], ['Ayush Katiyar', 'Events and Planning'], ['Nishat', 'Events and Planning'], ['Shreya Vishwakarma', 'Events and Planning'], ['Divyanka Pandey', 'Events and Planning'], ['Asad Khan', 'Marketing and Outreach'], ['Devanshi Srivastava', 'Marketing and Outreach'], ['Rishi Raj Singh', 'Marketing and Outreach'], ['Apurv', 'Marketing and Outreach'], ['Amitabh Chaturvedi', 'Marketing and Outreach'], ['Aakarsh', 'Finance and Sponsorship'], ['Bulbul Singh', 'Finance and Sponsorship'], ['Gopal Aggarwal', 'Finance and Sponsorship'], ['Shobhit Jain', 'Finance and Sponsorship'], ['Sumit Mishra', 'Finance and Sponsorship'], ['Ridam Baranwal', 'Finance and Sponsorship'], ['Amarjeet Pandey', 'Digital and Social Media'], ['Anubhav Singh', 'Digital and Social Media'], ['Lakshit Teotia', 'Digital and Social Media'], ['Saloni Singh', 'Digital and Social Media'], ['Manya Nigam', 'Digital and Social Media'], ['Shubham Raj', 'Visual Media and Production'], ['Suyash Khare', 'Visual Media and Production'], ['Ankush Kumar', 'Visual Media and Production'], ['Preetam Ray', 'Visual Media and Production'], ['Amit Kumar Gupta', 'Digital Infrastructure and Development'], ['Devendra Pratap Singh', 'Digital Infrastructure and Development'], ['Harsh Kumar', 'Digital Infrastructure and Development'], ['Nandini Goel', 'Digital Infrastructure and Development'], ['Pratibha Maurya', 'Digital Infrastructure and Development'], ['Jahanvi Pratap', 'Digital Infrastructure and Development'], ['Ishan Arora', 'Digital Infrastructure and Development'],
  ],
  '2025-2026': [
    ['Tanya Mishra', 'Marketing and Outreach'], ['Suyash Dwivedi', 'Marketing and Outreach'], ['Prateek Singh', 'Marketing and Outreach'], ['Arnav Garg', 'Marketing and Outreach'], ['Kashish Mani Tripathi', 'Marketing and Outreach'], ['Mallika Rathi', 'Marketing and Outreach'], ['Parth Srivastava', 'Marketing and Outreach'], ['Anshika Gupta', 'Marketing and Outreach'], ['Aditya Choudhary', 'Marketing and Outreach'], ['Asad Khan', 'Marketing and Outreach'], ['Shobhit', 'Marketing and Outreach'], ['Devanshi Srivastava', 'Marketing and Outreach'], ['Rishi Raj Singh Rajpoot', 'Marketing and Outreach'], ['Bulbul', 'Marketing and Outreach'], ['Amit Kumar Gupta', 'Digital Infrastructure and Development'], ['Pratibha Maurya', 'Digital Infrastructure and Development'], ['Jhanvi', 'Digital Infrastructure and Development'], ['Harsh Kumar', 'Digital Infrastructure and Development'], ['Preet Chauhan', 'Digital Infrastructure and Development'], ['Deevonika', 'Digital Infrastructure and Development'], ['Deepak', 'Digital Infrastructure and Development'], ['Suhani Gupta', 'Events and Planning'], ['Abhinay', 'Events and Planning'], ['Aditya Rauniyar', 'Events and Planning'], ['Harshita Dubey', 'Events and Planning'], ['Anushree Mishra', 'Events and Planning'], ['Ashutosh Dev', 'Events and Planning'], ['Kriti Kaushik', 'Events and Planning'], ['Saurav Tyagi', 'Events and Planning'], ['Divyansh', 'Events and Planning'], ['Ayush Aggarwal', 'Events and Planning'], ['Ayush Katiyar', 'Events and Planning'], ['Sahil Sahu', 'Events and Planning'], ['Ritish', 'Digital and Social Media'], ['Anurag Jai Singh', 'Digital and Social Media'], ['Aryan Chaudhary', 'Digital and Social Media'], ['Mahak Khurana', 'Digital and Social Media'], ['Apurv Verma', 'Digital and Social Media'], ['Anvita Shukla', 'Digital and Social Media'], ['Saloni Singh', 'Digital and Social Media'], ['Lakshit', 'Digital and Social Media'], ['Manya', 'Digital and Social Media'], ['Aabhas Viswas', 'Visual Media and Production'], ['Ashish Kashyap', 'Visual Media and Production'], ['Devansh Dev', 'Visual Media and Production'], ['Satyam Yadav', 'Visual Media and Production'], ['Shivani Srivastava', 'Visual Media and Production'], ['Shreya Palak', 'Visual Media and Production'], ['Shubham', 'Visual Media and Production'],
  ],
}

function Volunteers({ currentTeam }) {
  const [selectedRole, setSelectedRole] = useState('All')
  const volunteers = useMemo(() => volunteersData[currentTeam] || [], [currentTeam])
  const roles = useMemo(() => ['All', ...new Set(volunteers.map(([, role]) => role))], [volunteers])
  const visibleVolunteers = selectedRole === 'All' ? volunteers : volunteers.filter(([, role]) => role === selectedRole)

  return (
    <section className="volunteer-section" aria-labelledby="volunteer-title">
      <div className="volunteer-section__heading">
        <div><p className="eyebrow"><span>—</span> / Volunteers</p><h2 id="volunteer-title">The wider<br /><em>crew.</em></h2></div>
        <p>Every event is a team sport. Browse the volunteers who make the work happen across departments.</p>
      </div>
      <div className="volunteer-filter" role="group" aria-label="Filter volunteers by department">
        {roles.map((role) => <button key={role} type="button" onClick={() => setSelectedRole(role)} className={selectedRole === role ? 'is-selected' : ''}>{role}</button>)}
      </div>
      <div className="volunteer-list">
        {visibleVolunteers.map(([name, role], index) => <div className="volunteer-row" key={`${name}-${role}`}><span>{String(index + 1).padStart(2, '0')}</span><strong>{name}</strong><em>{role}</em></div>)}
      </div>
    </section>
  )
}

export default Volunteers
