module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    env: {
      dev: {
        src: 'dev/env'
      }
    },
    nodemon: {
      dev: {
        script: 'dev/js/index.js'
      }
    },
    mochaTest: {
      test: {
        src: "test/**/*.js"
      }
    }
  });

  // Load the plugin that provides the "uglify" task.
  grunt.loadNpmTasks('grunt-env');
  grunt.loadNpmTasks('grunt-contrib-nodemon');
  grunt.loadNpmTasks('grunt-mocha-test');

  // Default task(s).
  grunt.registerTask('default', ['env:dev','nodemon']);
  grunt.registerTask('test',['env:dev','mochaTest'] )

};