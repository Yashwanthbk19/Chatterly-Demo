import type {Country} from '../types/registration';

// Geographic calling regions checked against Google's libphonenumber metadata:
// https://github.com/google/libphonenumber/blob/master/resources/PhoneNumberMetadata.xml
// Keep the existing order so the default and shared-code matching stay stable.
// An optional fifth column lists all valid national-number lengths.
const COUNTRY_DATA = `IN|India|91|10
US|United States|1|10
GB|United Kingdom|44|10
AU|Australia|61|9
SG|Singapore|65|8
CA|Canada|1|10
AF|Afghanistan|93|9
AX|Åland Islands|358|10
AS|American Samoa|1|10
AI|Anguilla|1|10
AQ|Antarctica|672|6
AW|Aruba|297|7
AL|Albania|355|9
DZ|Algeria|213|9
AD|Andorra|376|6
AO|Angola|244|9
AG|Antigua and Barbuda|1|10
AR|Argentina|54|10
AM|Armenia|374|8
AT|Austria|43|10
AZ|Azerbaijan|994|9
BS|Bahamas|1|10
BH|Bahrain|973|8
BD|Bangladesh|880|10
BB|Barbados|1|10
BM|Bermuda|1|10
BY|Belarus|375|9
BE|Belgium|32|9
BZ|Belize|501|7
BJ|Benin|229|8
BT|Bhutan|975|8
BO|Bolivia|591|8
BA|Bosnia and Herzegovina|387|8
BW|Botswana|267|8
BR|Brazil|55|11
BN|Brunei|673|7
IO|British Indian Ocean Territory|246|7
BG|Bulgaria|359|9
BF|Burkina Faso|226|8
BI|Burundi|257|8
KH|Cambodia|855|9
KY|Cayman Islands|1|10
CX|Christmas Island|61|9
CC|Cocos Islands|61|9
CM|Cameroon|237|9
CV|Cape Verde|238|7
CF|Central African Republic|236|8
TD|Chad|235|8
CL|Chile|56|9
CN|China|86|11
CO|Colombia|57|10
CK|Cook Islands|682|5
CW|Curaçao|599|8
KM|Comoros|269|7
CG|Congo|242|9
CD|Democratic Republic of the Congo|243|9
CR|Costa Rica|506|8
HR|Croatia|385|9
CU|Cuba|53|8
CY|Cyprus|357|8
CZ|Czechia|420|9
DK|Denmark|45|8
DJ|Djibouti|253|8
DM|Dominica|1|10
DO|Dominican Republic|1|10
EC|Ecuador|593|9
EG|Egypt|20|10
SV|El Salvador|503|8
GQ|Equatorial Guinea|240|9
ER|Eritrea|291|7
EE|Estonia|372|8
FO|Faroe Islands|298|6
SZ|Eswatini|268|8
ET|Ethiopia|251|9
FJ|Fiji|679|7
FI|Finland|358|10
FR|France|33|9
PF|French Polynesia|689|8
GA|Gabon|241|8
GM|Gambia|220|7
GE|Georgia|995|9
DE|Germany|49|11
GH|Ghana|233|9
GR|Greece|30|10
GD|Grenada|1|10
GT|Guatemala|502|8
GN|Guinea|224|9
GW|Guinea-Bissau|245|9
GY|Guyana|592|7
HT|Haiti|509|8
HN|Honduras|504|8
HK|Hong Kong|852|8
GL|Greenland|299|6
GI|Gibraltar|350|8
GU|Guam|1|10
GG|Guernsey|44|10
HU|Hungary|36|9
IS|Iceland|354|7
ID|Indonesia|62|11
IM|Isle of Man|44|10
IR|Iran|98|10
IQ|Iraq|964|10
IE|Ireland|353|9
IL|Israel|972|9
IT|Italy|39|10
CI|Ivory Coast|225|10
JM|Jamaica|1|10
JP|Japan|81|10
JE|Jersey|44|10
JO|Jordan|962|9
KZ|Kazakhstan|7|10
KE|Kenya|254|9
KI|Kiribati|686|8
KW|Kuwait|965|8
KG|Kyrgyzstan|996|9
LA|Laos|856|10
LV|Latvia|371|8
LB|Lebanon|961|8
LS|Lesotho|266|8
LR|Liberia|231|8
LY|Libya|218|10
LI|Liechtenstein|423|7
LT|Lithuania|370|8
LU|Luxembourg|352|9
MO|Macao|853|8
MG|Madagascar|261|9
MW|Malawi|265|9
MY|Malaysia|60|10
MV|Maldives|960|7
ML|Mali|223|8
MT|Malta|356|8
MH|Marshall Islands|692|7
MR|Mauritania|222|8
MU|Mauritius|230|8
MX|Mexico|52|10
FM|Micronesia|691|7
MD|Moldova|373|8
MC|Monaco|377|8
MN|Mongolia|976|8
ME|Montenegro|382|8
MA|Morocco|212|9
MZ|Mozambique|258|9
MM|Myanmar|95|10
NA|Namibia|264|9
NR|Nauru|674|7
NP|Nepal|977|10
NL|Netherlands|31|9
NZ|New Zealand|64|9
NC|New Caledonia|687|6
MP|Northern Mariana Islands|1|10
NI|Nicaragua|505|8
NE|Niger|227|8
NG|Nigeria|234|10
KP|North Korea|850|10
MK|North Macedonia|389|8
NO|Norway|47|8
OM|Oman|968|8
PK|Pakistan|92|10
PS|Palestine|970|9
PW|Palau|680|7
PA|Panama|507|8
PG|Papua New Guinea|675|8
PY|Paraguay|595|9
PE|Peru|51|9
PH|Philippines|63|10
PL|Poland|48|9
PT|Portugal|351|9
PR|Puerto Rico|1|10
QA|Qatar|974|8
RO|Romania|40|10
RU|Russia|7|10
RW|Rwanda|250|9
KN|Saint Kitts and Nevis|1|10
LC|Saint Lucia|1|10
VC|Saint Vincent and the Grenadines|1|10
WS|Samoa|685|7
SM|San Marino|378|10
ST|Sao Tome and Principe|239|7
SA|Saudi Arabia|966|9
SN|Senegal|221|9
RS|Serbia|381|9
SC|Seychelles|248|7
SL|Sierra Leone|232|8
SK|Slovakia|421|9
SI|Slovenia|386|8
SB|Solomon Islands|677|7
SO|Somalia|252|9
ZA|South Africa|27|9
KR|South Korea|82|10
SS|South Sudan|211|9
ES|Spain|34|9
LK|Sri Lanka|94|9
SD|Sudan|249|9
SR|Suriname|597|7
SE|Sweden|46|9
CH|Switzerland|41|9
SY|Syria|963|9
TW|Taiwan|886|9
TJ|Tajikistan|992|9
TZ|Tanzania|255|9
TH|Thailand|66|9
TL|Timor-Leste|670|8
TG|Togo|228|8
TO|Tonga|676|7
TT|Trinidad and Tobago|1|10
TN|Tunisia|216|8
TR|Türkiye|90|10
TM|Turkmenistan|993|8
TV|Tuvalu|688|6
UG|Uganda|256|9
UA|Ukraine|380|9
AE|United Arab Emirates|971|9
UY|Uruguay|598|8
UZ|Uzbekistan|998|9
VU|Vanuatu|678|7
VA|Vatican City|39|10
VE|Venezuela|58|10
VN|Vietnam|84|10
YE|Yemen|967|9
ZM|Zambia|260|9
ZW|Zimbabwe|263|9
AC|Ascension Island|247|5
BQ|Bonaire, Sint Eustatius and Saba|599|7
VG|British Virgin Islands|1|10
FK|Falkland Islands|500|5
GF|French Guiana|594|9
GP|Guadeloupe|590|9
XK|Kosovo|383|8
MQ|Martinique|596|9
YT|Mayotte|262|9
MS|Montserrat|1|10
NU|Niue|683|7|4,7
NF|Norfolk Island|672|6
RE|Réunion|262|9
BL|Saint Barthélemy|590|9
SH|Saint Helena|290|5
MF|Saint Martin|590|9
PM|Saint Pierre and Miquelon|508|9|6,9
SX|Sint Maarten|1|10
SJ|Svalbard and Jan Mayen|47|8
TK|Tokelau|690|7|4,5,6,7
TA|Tristan da Cunha|290|4
TC|Turks and Caicos Islands|1|10
VI|U.S. Virgin Islands|1|10
WF|Wallis and Futuna|681|6
EH|Western Sahara|212|9`;

const flagFor = (code: string) => String.fromCodePoint(...code.toUpperCase().split('').map(char => char.charCodeAt(0) + 127397));
export const COUNTRIES: Country[] = COUNTRY_DATA.split('\n').map(line => {
  const [code, name, dialCode, phoneLength, phoneLengths] = line.split('|');
  return {
    code, name, dialCode: `+${dialCode}`, phoneLength: Number(phoneLength), flag: flagFor(code),
    ...(phoneLengths ? {phoneLengths: phoneLengths.split(',').map(Number)} : {}),
  };
});

export const DEFAULT_COUNTRY = COUNTRIES[0];
