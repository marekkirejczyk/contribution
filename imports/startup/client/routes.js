import { FlowRouter } from 'meteor/kadira:flow-router';
import { BlazeLayout } from 'meteor/kadira:blaze-layout';

// Import to load these templates
import '../../ui/layouts/main.js';
import '../../ui/layouts/header.js';
import '../../ui/layouts/footer.js';
import '../../ui/pages/terms.js';
import '../../ui/pages/contribution.js';

// Default route
FlowRouter.route('/', {
  name: 'terms',
  action() {
    BlazeLayout.render('layout_main', {
      // nav: 'layout_header',
      main: 'terms',
      // footer: 'layout_footer',
    });
  },
});

// Route for contribution
FlowRouter.route('/contribution', {
  name: 'contribution',
  action() {
    BlazeLayout.render('layout_main', {
      // nav: 'layout_header',
      main: 'contribution',
      // footer: 'layout_footer',
    });
  },
});
