const permission = {
  status: 'undetermined',
  granted: false,
  canAskAgain: true,
  expires: 'never',
};

module.exports = {
  PermissionStatus: {
    DENIED: 'denied',
    GRANTED: 'granted',
    UNDETERMINED: 'undetermined',
  },
  ContactField: {
    FULL_NAME: 'fullName',
    GIVEN_NAME: 'givenName',
    FAMILY_NAME: 'familyName',
    PHONES: 'phones',
    EMAILS: 'emails',
    THUMBNAIL: 'thumbnail',
  },
  ContactsSortOrder: {
    GivenName: 'givenName',
  },
  Contact: {
    getAllDetails: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({id: 'created-contact'}),
    presentCreateForm: jest.fn().mockResolvedValue(false),
  },
  getPermissionsAsync: jest.fn().mockResolvedValue(permission),
  requestPermissionsAsync: jest.fn().mockResolvedValue(permission),
  addContactsChangeListener: jest.fn(() => ({remove: jest.fn()})),
};
