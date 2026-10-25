/**
 * States, union territories and major cities, used as suggestions on the
 * address fields.
 *
 * These are *suggestions*, never a whitelist: the API stores free text, so a
 * village that is not listed can still be typed by hand. Everything here is
 * plain data plus tiny lookups — no dependency, safe to import from any portal.
 *
 * The union territories are folded into the same list because a renter in
 * Delhi or Puducherry picks an address the same way as one in Karnataka.
 */
export const INDIA_STATES = [
  { name: 'Andaman and Nicobar Islands', cities: ['Port Blair', 'Car Nicobar', 'Diglipur', 'Mayabunder', 'Rangat', 'Swaraj Dweep', 'Shaheed Dweep'] },
  { name: 'Andhra Pradesh', cities: ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Tirupati', 'Rajahmundry', 'Kakinada', 'Kadapa', 'Anantapur', 'Eluru', 'Ongole', 'Chittoor', 'Machilipatnam', 'Srikakulam', 'Vizianagaram', 'Tenali', 'Proddatur', 'Nandyal', 'Adoni', 'Madanapalle', 'Bhimavaram'] },
  { name: 'Arunachal Pradesh', cities: ['Itanagar', 'Naharlagun', 'Pasighat', 'Tawang', 'Ziro', 'Bomdila', 'Aalo', 'Tezu', 'Roing', 'Namsai', 'Seppa', 'Daporijo'] },
  { name: 'Assam', cities: ['Guwahati', 'Dibrugarh', 'Silchar', 'Jorhat', 'Tezpur', 'Nagaon', 'Tinsukia', 'Bongaigaon', 'Karimganj', 'Sivasagar', 'Goalpara', 'Barpeta', 'Dhubri', 'Diphu', 'North Lakhimpur', 'Golaghat', 'Haflong'] },
  { name: 'Bihar', cities: ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Darbhanga', 'Purnia', 'Bihar Sharif', 'Arrah', 'Begusarai', 'Katihar', 'Munger', 'Chhapra', 'Danapur', 'Saharsa', 'Hajipur', 'Sasaram', 'Dehri', 'Siwan', 'Motihari', 'Nawada', 'Bagaha', 'Bettiah', 'Jamalpur', 'Jehanabad'] },
  { name: 'Chandigarh', cities: ['Chandigarh'] },
  { name: 'Chhattisgarh', cities: ['Raipur', 'Bhilai', 'Bilaspur', 'Korba', 'Durg', 'Dhamtari', 'Raigarh', 'Jagdalpur', 'Ambikapur', 'Mahasamund', 'Chirmiri', 'Janjgir', 'Kanker'] },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', cities: ['Silvassa', 'Daman', 'Diu'] },
  { name: 'Delhi', cities: ['New Delhi', 'Delhi', 'Dwarka', 'Rohini', 'Karol Bagh', 'Saket', 'Lajpat Nagar', 'Pitampura', 'Janakpuri', 'Shahdara', 'Vasant Kunj', 'Mayur Vihar'] },
  { name: 'Goa', cities: ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa', 'Ponda', 'Bicholim', 'Curchorem', 'Canacona', 'Calangute', 'Candolim', 'Old Goa'] },
  { name: 'Gujarat', cities: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Junagadh', 'Gandhinagar', 'Gandhidham', 'Anand', 'Navsari', 'Morbi', 'Nadiad', 'Surendranagar', 'Bharuch', 'Mehsana', 'Bhuj', 'Porbandar', 'Palanpur', 'Valsad', 'Vapi', 'Gondal', 'Veraval', 'Godhra', 'Patan', 'Dahod', 'Botad', 'Amreli'] },
  { name: 'Haryana', cities: ['Faridabad', 'Gurugram', 'Panipat', 'Ambala', 'Yamunanagar', 'Rohtak', 'Hisar', 'Karnal', 'Sonipat', 'Panchkula', 'Bhiwani', 'Sirsa', 'Bahadurgarh', 'Jind', 'Kaithal', 'Rewari', 'Palwal', 'Kurukshetra', 'Fatehabad', 'Narnaul', 'Gohana', 'Tohana'] },
  { name: 'Himachal Pradesh', cities: ['Shimla', 'Manali', 'Dharamshala', 'Solan', 'Mandi', 'Kullu', 'Palampur', 'Baddi', 'Nahan', 'Hamirpur', 'Una', 'Bilaspur', 'Chamba', 'Kangra', 'Kasauli', 'Sundernagar'] },
  { name: 'Jammu and Kashmir', cities: ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla', 'Sopore', 'Kathua', 'Udhampur', 'Rajouri', 'Poonch', 'Kupwara', 'Ganderbal', 'Pulwama', 'Kulgam', 'Bandipora'] },
  { name: 'Jharkhand', cities: ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro Steel City', 'Deoghar', 'Hazaribagh', 'Giridih', 'Ramgarh', 'Medininagar', 'Chaibasa', 'Sahibganj', 'Dumka', 'Phusro', 'Chirkunda', 'Godda', 'Koderma', 'Pakur'] },
  { name: 'Karnataka', cities: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi', 'Dharwad', 'Belagavi', 'Kalaburagi', 'Davanagere', 'Ballari', 'Vijayapura', 'Shivamogga', 'Tumakuru', 'Raichur', 'Bidar', 'Udupi', 'Hassan', 'Mandya', 'Chitradurga', 'Kolar', 'Bagalkot', 'Gadag', 'Haveri', 'Sirsi', 'Chikkamagaluru', 'Puttur', 'Karwar', 'Ranebennur'] },
  { name: 'Kerala', cities: ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam', 'Alappuzha', 'Palakkad', 'Kannur', 'Kottayam', 'Malappuram', 'Kasaragod', 'Pathanamthitta', 'Kalpetta', 'Munnar', 'Varkala', 'Kovalam', 'Guruvayur', 'Ernakulam'] },
  { name: 'Ladakh', cities: ['Leh', 'Kargil', 'Diskit', 'Nubra'] },
  { name: 'Lakshadweep', cities: ['Kavaratti', 'Agatti', 'Minicoy', 'Amini', 'Andrott'] },
  { name: 'Madhya Pradesh', cities: ['Indore', 'Bhopal', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Dewas', 'Satna', 'Ratlam', 'Rewa', 'Katni', 'Singrauli', 'Burhanpur', 'Khandwa', 'Bhind', 'Chhindwara', 'Guna', 'Shivpuri', 'Vidisha', 'Damoh', 'Chhatarpur', 'Hoshangabad', 'Sehore', 'Mandsaur', 'Neemuch', 'Betul', 'Seoni', 'Datia'] },
  { name: 'Maharashtra', cities: ['Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Chhatrapati Sambhajinagar', 'Solapur', 'Amravati', 'Kolhapur', 'Sangli', 'Jalgaon', 'Akola', 'Latur', 'Dhule', 'Ahmednagar', 'Chandrapur', 'Parbhani', 'Nanded', 'Satara', 'Navi Mumbai', 'Panvel', 'Bhiwandi', 'Vasai-Virar', 'Kalyan', 'Dombivli', 'Ulhasnagar', 'Ambernath', 'Badlapur', 'Ratnagiri', 'Alibaug', 'Wardha', 'Yavatmal', 'Buldhana', 'Beed', 'Dharashiv', 'Gondia', 'Bhandara'] },
  { name: 'Manipur', cities: ['Imphal', 'Thoubal', 'Bishnupur', 'Churachandpur', 'Ukhrul', 'Senapati', 'Kakching', 'Moreh'] },
  { name: 'Meghalaya', cities: ['Shillong', 'Tura', 'Nongstoin', 'Jowai', 'Sohra', 'Baghmara', 'Williamnagar', 'Resubelpara'] },
  { name: 'Mizoram', cities: ['Aizawl', 'Lunglei', 'Champhai', 'Serchhip', 'Kolasib', 'Saiha', 'Lawngtlai', 'Mamit'] },
  { name: 'Nagaland', cities: ['Kohima', 'Dimapur', 'Mokokchung', 'Tuensang', 'Wokha', 'Zunheboto', 'Mon', 'Phek'] },
  { name: 'Odisha', cities: ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Sambalpur', 'Puri', 'Balasore', 'Bhadrak', 'Baripada', 'Jharsuguda', 'Angul', 'Dhenkanal', 'Koraput', 'Rayagada', 'Balangir', 'Jeypore', 'Paradip', 'Kendrapara'] },
  { name: 'Puducherry', cities: ['Puducherry', 'Karaikal', 'Mahe', 'Yanam', 'Villianur'] },
  { name: 'Punjab', cities: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali', 'Hoshiarpur', 'Batala', 'Pathankot', 'Moga', 'Abohar', 'Malerkotla', 'Khanna', 'Phagwara', 'Sri Muktsar Sahib', 'Barnala', 'Rajpura', 'Firozpur', 'Kapurthala', 'Sangrur'] },
  { name: 'Rajasthan', cities: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Bikaner', 'Ajmer', 'Bhilwara', 'Alwar', 'Bharatpur', 'Sikar', 'Pali', 'Sri Ganganagar', 'Tonk', 'Kishangarh', 'Beawar', 'Hanumangarh', 'Churu', 'Jhunjhunu', 'Baran', 'Chittorgarh', 'Sawai Madhopur', 'Jaisalmer', 'Nagaur', 'Dungarpur', 'Banswara', 'Mount Abu', 'Pushkar'] },
  { name: 'Sikkim', cities: ['Gangtok', 'Namchi', 'Gyalshing', 'Mangan', 'Rangpo', 'Singtam', 'Jorethang', 'Pelling'] },
  { name: 'Tamil Nadu', cities: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Tiruppur', 'Vellore', 'Erode', 'Thoothukudi', 'Dindigul', 'Thanjavur', 'Ranipet', 'Sivakasi', 'Karur', 'Udhagamandalam', 'Hosur', 'Nagercoil', 'Kanchipuram', 'Karaikudi', 'Kumbakonam', 'Cuddalore', 'Pudukkottai', 'Pollachi', 'Ambur', 'Vaniyambadi', 'Nagapattinam', 'Villupuram', 'Tiruvannamalai'] },
  { name: 'Telangana', cities: ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Ramagundam', 'Khammam', 'Mahbubnagar', 'Nalgonda', 'Adilabad', 'Suryapet', 'Siddipet', 'Miryalaguda', 'Jagtial', 'Mancherial', 'Nirmal', 'Kamareddy', 'Kothagudem', 'Bodhan', 'Sangareddy', 'Medak', 'Zaheerabad'] },
  { name: 'Tripura', cities: ['Agartala', 'Udaipur', 'Dharmanagar', 'Kailashahar', 'Belonia', 'Khowai', 'Ambassa', 'Kamalpur'] },
  { name: 'Uttar Pradesh', cities: ['Lucknow', 'Kanpur', 'Ghaziabad', 'Agra', 'Varanasi', 'Meerut', 'Prayagraj', 'Bareilly', 'Aligarh', 'Moradabad', 'Saharanpur', 'Gorakhpur', 'Noida', 'Greater Noida', 'Firozabad', 'Jhansi', 'Muzaffarnagar', 'Mathura', 'Vrindavan', 'Budaun', 'Rampur', 'Shahjahanpur', 'Farrukhabad', 'Ayodhya', 'Mirzapur', 'Bijnor', 'Etawah', 'Sitapur', 'Bahraich', 'Amroha', 'Loni', 'Rae Bareli', 'Hardoi', 'Mainpuri', 'Unnao', 'Jaunpur', 'Sultanpur', 'Azamgarh', 'Deoria', 'Ballia'] },
  { name: 'Uttarakhand', cities: ['Dehradun', 'Haridwar', 'Rishikesh', 'Roorkee', 'Haldwani', 'Rudrapur', 'Nainital', 'Kashipur', 'Mussoorie', 'Almora', 'Pithoragarh', 'Ramnagar', 'Kotdwar', 'New Tehri', 'Pauri', 'Bageshwar', 'Champawat', 'Uttarkashi'] },
  { name: 'West Bengal', cities: ['Kolkata', 'Howrah', 'Durgapur', 'Asansol', 'Siliguri', 'Bardhaman', 'Malda', 'Baharampur', 'Kharagpur', 'Haldia', 'Krishnanagar', 'Jalpaiguri', 'Balurghat', 'Bankura', 'Purulia', 'Darjeeling', 'Kalimpong', 'Cooch Behar', 'Barasat', 'Serampore', 'Chandannagar', 'Midnapore', 'Contai', 'Bolpur', 'Santiniketan', 'Raiganj', 'Alipurduar'] },
];

export const STATE_NAMES = INDIA_STATES.map((s) => s.name);

/** Every city across the country, used when no state has been picked yet. */
export const ALL_CITIES = [...new Set(INDIA_STATES.flatMap((s) => s.cities))].sort((a, b) => a.localeCompare(b));

const STATE_BY_KEY = new Map(INDIA_STATES.map((s) => [s.name.toLowerCase(), s]));

// A city name can exist in two states (Bilaspur is in both Himachal and
// Chhattisgarh), so entries list every state that claims the name. Auto-fill
// only happens when the answer is unambiguous.
const STATES_BY_CITY = new Map();
const CITY_BY_KEY = new Map();
for (const state of INDIA_STATES) {
  for (const city of state.cities) {
    const key = city.toLowerCase();
    const list = STATES_BY_CITY.get(key) || [];
    list.push(state.name);
    STATES_BY_CITY.set(key, list);
    CITY_BY_KEY.set(key, city);
  }
}

/** Cities to suggest: the chosen state's list, or the whole country. */
export function citiesForState(state) {
  const match = STATE_BY_KEY.get(String(state || '').trim().toLowerCase());
  return match ? [...match.cities].sort((a, b) => a.localeCompare(b)) : ALL_CITIES;
}

/** "karnataka" -> "Karnataka"; anything unrecognised is kept exactly as typed. */
export function canonicalState(value) {
  const match = STATE_BY_KEY.get(String(value || '').trim().toLowerCase());
  return match ? match.name : value;
}

/** Spelling-corrects a known city, preferring the state the user picked. */
export function canonicalCity(value, state) {
  const typed = String(value || '').trim();
  if (!typed) return typed;
  const key = typed.toLowerCase();
  const inState = STATE_BY_KEY.get(String(state || '').trim().toLowerCase())
    ?.cities.find((c) => c.toLowerCase() === key);
  return inState || CITY_BY_KEY.get(key) || typed;
}

/** The state a city belongs to, when only one state claims that name. */
export function stateOfCity(city) {
  const states = STATES_BY_CITY.get(String(city || '').trim().toLowerCase());
  return states && states.length === 1 ? states[0] : '';
}
