"""Sample data for demos. Fees and processing days are realistic placeholders."""
from datetime import date

PROGRAMS = [
    ("BSIT", "Bachelor of Science in Information Technology", "College of Computing and Information Sciences"),
    ("BSCS", "Bachelor of Science in Computer Science", "College of Computing and Information Sciences"),
    ("BSN", "Bachelor of Science in Nursing", "College of Nursing"),
    ("BSMT", "Bachelor of Science in Medical Technology", "College of Medical Technology"),
    ("BSPSY", "Bachelor of Science in Psychology", "College of Arts, Sciences and Education"),
    ("ABCOMM", "Bachelor of Arts in Communication", "College of Arts, Sciences and Education"),
    ("BSED-ENG", "Bachelor of Secondary Education major in English", "College of Arts, Sciences and Education"),
    ("BSA", "Bachelor of Science in Accountancy", "College of Business Administration"),
    ("BSBA-MM", "BS Business Administration major in Marketing Management", "College of Business Administration"),
    ("BSHM", "Bachelor of Science in Hospitality Management", "College of Hospitality and Tourism Management"),
    ("BSTM", "Bachelor of Science in Tourism Management", "College of Hospitality and Tourism Management"),
    ("BSCE", "Bachelor of Science in Civil Engineering", "College of Engineering"),
]

TERMS = ["1st Semester", "2nd Semester", "Summer"]
ACADEMIC_YEARS = ["2026–2027", "2025–2026", "2024–2025", "2023–2024", "2022–2023"]
COMMON_PURPOSES = ["Employment", "Scholarship application", "Further studies", "Personal copy", "Visa / travel"]

VALID_ID = {"key": "valid_id", "label": "Valid ID (school or government ID)", "required": True,
            "accept": ["pdf", "jpg", "png"], "max_mb": 5, "help": "Front side, with your photo and full name visible."}
CLEARANCE = {"key": "clearance", "label": "Signed student clearance", "required": True,
             "accept": ["pdf", "jpg", "png"], "max_mb": 5, "help": "Signed by the Library, Accounting and your Dean."}
AUTH_LETTER = {"key": "authorization_letter", "label": "Authorization letter (if someone else will claim)",
               "required": False, "accept": ["pdf", "jpg", "png"], "max_mb": 5,
               "help": "Include the representative's name and a copy of their valid ID."}

TERM_FIELD = {"key": "term", "label": "Term", "type": "select", "required": True, "options": TERMS}
AY_FIELD = {"key": "academic_year", "label": "Academic year", "type": "select", "required": True, "options": ACADEMIC_YEARS}

DOCUMENT_TYPES = [
    {
        "code": "TOR", "slug": "transcript-of-records", "name": "Transcript of Records (TOR)", "category": "record",
        "description": "Official record of all subjects taken, grades, and units earned.",
        "base_fee": "300.00", "fee_per_copy": True, "max_copies": 5, "processing_days": 10,
        "requires_payment": True, "allow_courier": True, "allow_edocument": False,
        "purposes": ["Employment", "Transfer to another school", "Board / licensure exam", "Further studies",
                     "Scholarship application", "Personal copy"],
        "required_fields": [
            {"key": "last_term_attended", "label": "Last term attended", "type": "text", "required": True,
             "placeholder": "e.g., 2nd Semester, AY 2025–2026"},
            {"key": "receiving_school", "label": "Receiving school (if for transfer)", "type": "text", "required": False},
        ],
        "required_attachments": [VALID_ID, CLEARANCE, AUTH_LETTER],
        "instructions": "Graduates and former students must have a signed clearance. The TOR is printed on security paper and is not available as an e-document.",
    },
    {
        "code": "COE", "slug": "certificate-of-enrollment", "name": "Certificate of Enrollment / Registration",
        "category": "certificate",
        "description": "Certifies that you are officially enrolled for a specific term.",
        "base_fee": "100.00", "fee_per_copy": True, "max_copies": 5, "processing_days": 2,
        "requires_payment": True, "allow_courier": True, "allow_edocument": True,
        "purposes": COMMON_PURPOSES + ["Bank / loan requirement", "SSS / PhilHealth / Pag-IBIG"],
        "required_fields": [TERM_FIELD, AY_FIELD],
        "required_attachments": [VALID_ID],
        "instructions": "Available as a watermarked e-document with a verification QR code.",
    },
    {
        "code": "COG", "slug": "certificate-of-grades", "name": "Certificate of Grades", "category": "certificate",
        "description": "Lists your final grades for a specific term.",
        "base_fee": "100.00", "fee_per_copy": True, "max_copies": 5, "processing_days": 3,
        "requires_payment": True, "allow_courier": True, "allow_edocument": True,
        "purposes": COMMON_PURPOSES + ["Dean's list / honors application"],
        "required_fields": [TERM_FIELD, AY_FIELD],
        "required_attachments": [VALID_ID],
        "instructions": "Grades must already be posted for the selected term.",
    },
    {
        "code": "GMC", "slug": "certificate-of-good-moral-character", "name": "Certificate of Good Moral Character",
        "category": "certificate",
        "description": "Certifies that you have no record of disciplinary action at TUA.",
        "base_fee": "150.00", "fee_per_copy": True, "max_copies": 3, "processing_days": 5,
        "requires_payment": True, "allow_courier": True, "allow_edocument": True,
        "purposes": ["Employment", "Transfer to another school", "Board / licensure exam", "Scholarship application"],
        "required_fields": [],
        "required_attachments": [VALID_ID, CLEARANCE],
        "instructions": "Subject to verification by the Office of Student Affairs.",
    },
    {
        "code": "DIP", "slug": "diploma-certified-true-copy", "name": "Diploma / Certified True Copy",
        "category": "record",
        "description": "Replacement diploma or a certified true copy of your diploma.",
        "base_fee": "200.00", "fee_per_copy": True, "max_copies": 3, "processing_days": 7,
        "requires_payment": True, "allow_courier": True, "allow_edocument": False,
        "purposes": ["Certified true copy for employment", "Certified true copy for abroad",
                     "Replacement of lost diploma", "Replacement of damaged diploma"],
        "required_fields": [
            {"key": "year_graduated", "label": "Year graduated", "type": "number", "required": True,
             "placeholder": "e.g., 2024"},
            {"key": "affidavit_of_loss", "label": "I will submit an affidavit of loss in person (for lost diplomas)",
             "type": "checkbox", "required": False},
        ],
        "required_attachments": [
            VALID_ID,
            {"key": "diploma_copy", "label": "Photocopy or photo of your diploma", "required": False,
             "accept": ["pdf", "jpg", "png"], "max_mb": 5, "help": "Required for certified true copies."},
        ],
        "instructions": "For graduates only. Replacement diplomas require an affidavit of loss.",
    },
    {
        "code": "HD", "slug": "honorable-dismissal", "name": "Honorable Dismissal",
        "category": "certificate",
        "description": "Transfer credential issued when you move to another school.",
        "base_fee": "500.00", "fee_per_copy": False, "max_copies": 1, "processing_days": 7,
        "requires_payment": True, "allow_courier": False, "allow_edocument": False,
        "purposes": ["Transfer to another school"],
        "required_fields": [
            {"key": "receiving_school", "label": "Receiving school", "type": "text", "required": True},
            {"key": "reason", "label": "Reason for transferring", "type": "textarea", "required": True, "max_length": 500},
        ],
        "required_attachments": [
            VALID_ID, CLEARANCE,
            {"key": "acceptance_letter", "label": "Letter of acceptance from receiving school", "required": False,
             "accept": ["pdf", "jpg", "png"], "max_mb": 5},
        ],
        "instructions": "Issued together with your TOR (request it separately). Pick-up only.",
    },
    {
        "code": "CDC", "slug": "course-description", "name": "Course Description / Curriculum Certification",
        "category": "certificate",
        "description": "Official descriptions of the subjects you took, for credit evaluation.",
        "base_fee": "250.00", "fee_per_copy": True, "max_copies": 3, "processing_days": 7,
        "requires_payment": True, "allow_courier": True, "allow_edocument": True,
        "purposes": ["Credit evaluation at another school", "Further studies", "Licensure abroad"],
        "required_fields": [
            {"key": "subjects", "label": "Subjects to include", "type": "textarea", "required": True,
             "placeholder": "List subject codes, or write ALL", "max_length": 1000},
        ],
        "required_attachments": [VALID_ID],
        "instructions": "",
    },
    {
        "code": "SHF", "slug": "shifting-form", "name": "Shifting Form", "category": "form",
        "description": "Apply to move from your current program to another program.",
        "base_fee": "0.00", "fee_per_copy": False, "max_copies": 1, "processing_days": 3,
        "requires_payment": False, "allow_courier": False, "allow_edocument": False,
        "purposes": ["Shift to another program"],
        "required_fields": [
            {"key": "new_program", "label": "Program you want to shift to", "type": "text", "required": True},
            {"key": "effective_term", "label": "Effective term", "type": "select", "required": True, "options": TERMS},
            {"key": "reason", "label": "Reason for shifting", "type": "textarea", "required": True, "max_length": 500},
        ],
        "required_attachments": [],
        "instructions": "Your current and receiving Deans will be asked to approve the shift.",
    },
    {
        "code": "LOA", "slug": "leave-of-absence", "name": "Leave of Absence", "category": "form",
        "description": "Officially pause your studies for up to one academic year.",
        "base_fee": "0.00", "fee_per_copy": False, "max_copies": 1, "processing_days": 3,
        "requires_payment": False, "allow_courier": False, "allow_edocument": False,
        "purposes": ["Medical", "Financial", "Family", "Work"],
        "required_fields": [
            TERM_FIELD, AY_FIELD,
            {"key": "details", "label": "Details", "type": "textarea", "required": True, "max_length": 500},
        ],
        "required_attachments": [
            {"key": "supporting_document", "label": "Supporting document (e.g., medical certificate)",
             "required": False, "accept": ["pdf", "jpg", "png"], "max_mb": 5},
        ],
        "instructions": "",
    },
    {
        "code": "ADD", "slug": "subject-add-drop", "name": "Subject Adding / Dropping", "category": "form",
        "description": "Add or drop subjects after enrollment, within the official period.",
        "base_fee": "50.00", "fee_per_copy": False, "max_copies": 1, "processing_days": 2,
        "requires_payment": True, "allow_courier": False, "allow_edocument": False,
        "purposes": ["Add subject(s)", "Drop subject(s)", "Add and drop subjects"],
        "required_fields": [
            TERM_FIELD,
            {"key": "subjects_to_add", "label": "Subjects to add", "type": "textarea", "required": False,
             "placeholder": "Subject code, section, schedule"},
            {"key": "subjects_to_drop", "label": "Subjects to drop", "type": "textarea", "required": False},
        ],
        "required_attachments": [],
        "instructions": "Only allowed during the adding/dropping period in the academic calendar.",
    },
    {
        "code": "CHI", "slug": "change-of-information", "name": "Change of Student Information", "category": "form",
        "description": "Correct your name, birthdate, or other personal details in school records.",
        "base_fee": "0.00", "fee_per_copy": False, "max_copies": 1, "processing_days": 5,
        "requires_payment": False, "allow_courier": False, "allow_edocument": False,
        "purposes": ["Correction of error", "Change after marriage", "Court order"],
        "required_fields": [
            {"key": "field_to_change", "label": "What needs to change", "type": "select", "required": True,
             "options": ["Name", "Birthdate", "Birthplace", "Civil status", "Sex", "Address"]},
            {"key": "current_value", "label": "Current value in records", "type": "text", "required": True},
            {"key": "new_value", "label": "Correct value", "type": "text", "required": True},
        ],
        "required_attachments": [
            {"key": "psa_document", "label": "PSA birth or marriage certificate", "required": True,
             "accept": ["pdf", "jpg", "png"], "max_mb": 5},
        ],
        "instructions": "The PSA-issued document must match the new value exactly.",
    },
]

HOLIDAYS = [
    (date(2026, 10, 31), "Special Non-Working Day (All Saints' Day Eve)"),
    (date(2026, 11, 2), "All Souls' Day"),
    (date(2026, 11, 30), "Bonifacio Day"),
    (date(2026, 12, 8), "Feast of the Immaculate Conception"),
    (date(2026, 12, 24), "Christmas Eve"),
    (date(2026, 12, 25), "Christmas Day"),
    (date(2026, 12, 30), "Rizal Day"),
    (date(2026, 12, 31), "Last Day of the Year"),
    (date(2027, 1, 1), "New Year's Day"),
]

FIRST_NAMES = [
    "Juan", "Maria", "Jose", "Angelica", "Mark", "Kristine", "John Paul", "Nicole", "Carlo", "Patricia",
    "Miguel", "Samantha", "Rafael", "Bea", "Joshua", "Camille", "Paolo", "Andrea", "Gabriel", "Janelle",
    "Christian", "Sofia", "Daniel", "Trisha", "Ramon",
]
LAST_NAMES = [
    "Dela Cruz", "Santos", "Reyes", "Garcia", "Mendoza", "Bautista", "Villanueva", "Aquino", "Ramos", "Castillo",
    "Navarro", "Torres", "Flores", "Gonzales", "Mercado", "Fernandez", "Domingo", "Pascual", "Salazar", "Lim",
    "Tan", "Rivera", "Cruz", "Ocampo", "Manalo",
]
MIDDLE_NAMES = ["Bautista", "Reyes", "Santos", "Lopez", "Perez", "Rosales", "Mariano", "Javier", None]
CITIES = [
    ("Quezon City", "Metro Manila", "1112", "metro"), ("Marikina City", "Metro Manila", "1800", "metro"),
    ("Pasig City", "Metro Manila", "1600", "metro"), ("Antipolo City", "Rizal", "1870", "provincial"),
    ("San Fernando", "Pampanga", "2000", "provincial"), ("Batangas City", "Batangas", "4200", "provincial"),
]

NEEDS_CORRECTION_REMARKS = [
    "The uploaded valid ID is blurry. Please upload a clearer copy where your name and photo are readable.",
    "Your clearance is missing the Accounting Office signature. Please upload the fully signed clearance.",
    "The term you selected has no posted grades yet. Please choose a previous term.",
]
REJECTED_REMARKS = [
    "Our records show an outstanding balance with the Accounting Office. Please settle it, then submit a new request.",
    "This is a duplicate of an earlier request that is already being processed.",
]
CANCEL_REMARKS = ["Submitted by mistake.", "No longer needed.", None]
